from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from ..clients.beacon_api import BeaconAPI
from ..clients.execution_rpc import ExecutionRPC
from ..config import SelfProbeConfig
from ..db import DB

log = logging.getLogger(__name__)

# Retrieval schedule for self-probes. Offsets in seconds from submit_ts.
SELF_PROBE_RETRIEVE_OFFSETS_SECONDS: tuple[tuple[str, int], ...] = (
    ("immediate", 0),
    ("10m",       600),
    ("1d",        24 * 3600),
    ("7d",        7 * 24 * 3600),
    ("14d",       14 * 24 * 3600),
    ("17d",       17 * 24 * 3600),
    ("18d",       18 * 24 * 3600),
    ("19d",       19 * 24 * 3600),
)

GWEI = Decimal("1000000000")            # 10^9
ETH  = Decimal("1000000000000000000")   # 10^18
BLOB_SIZE_BYTES = 131072                # 4096 field elements * 32 bytes
GAS_PER_BLOB     = 131072               # blob gas units per blob
TX_EXEC_GAS      = 21000                # plain EOA->EOA, no calldata

# Cap blast radius from txs that are submitted but not yet included.
# If this many self-probe rows are still 'pending' (no receipt yet), refuse
# new submits until at least one resolves. Caps the worst-case exposure to
# MAX_PENDING_PROBES * per_tx_max_cost.
MAX_PENDING_PROBES = 3


# ----------------------- payload generation ------------------------------

def make_blob_payload() -> bytes:
    """Build a 128 KiB blob payload that is valid for KZG (every 32-byte
    field element starts with a zero high byte, well below BLS_MODULUS).

    Layout:
      byte 0       : 0x00 (high byte of field element 0)
      bytes 1..4   : ASCII marker 'EDA1'
      bytes 5..31  : 27 random bytes (nonce)
      bytes 32..N  : repeating pattern (zero high byte + 31 random bytes)
    """
    buf = bytearray(BLOB_SIZE_BYTES)
    buf[0] = 0
    buf[1:5] = b"EDA1"
    buf[5:32] = secrets.token_bytes(27)
    for i in range(32, BLOB_SIZE_BYTES, 32):
        buf[i] = 0
        buf[i + 1:i + 32] = secrets.token_bytes(31)
    return bytes(buf)


# ----------------------- guardrails --------------------------------------

class GuardrailFailure(Exception):
    pass


async def _wei_spent(db: DB, *, window: str | None) -> int:
    """Sum of observed costs (rows with a receipt). In-flight rows are
    bounded separately by MAX_PENDING_PROBES — see _pending_probe_count."""
    where = "submit_status NOT IN ('dry_run','refused') AND submit_cost_wei IS NOT NULL"
    if window:
        where += f" AND submit_timestamp > now() - INTERVAL '{window}'"
    v = await db.fetchval(
        f"SELECT COALESCE(SUM(submit_cost_wei),0)::TEXT FROM self_probe_ethereum WHERE {where}"
    )
    return int(v or 0)


async def _pending_probe_count(db: DB) -> int:
    return int(await db.fetchval(
        "SELECT count(*) FROM self_probe_ethereum WHERE submit_status='pending'"
    ) or 0)


async def evaluate_guardrails(
    cfg: SelfProbeConfig, db: DB, exec_rpc: ExecutionRPC,
    from_address: str, *, network: str,
) -> Optional[str]:
    """Returns None if a real submit is allowed, else a string reason.
    Never raises — errors are converted to reason strings so we always
    write a row recording the decision."""
    if not cfg.enabled:
        return "self_probe_disabled"
    if cfg.dry_run:
        return "dry_run"
    if not cfg.private_key:
        return "no_private_key"
    if not from_address:
        return "derive_address_failed"

    # Chain-id sanity vs the network the operator claims to be on.
    chain_id_hex = await exec_rpc.call("eth_chainId")
    if not chain_id_hex:
        return "chain_id_query_failed"
    chain_id = int(chain_id_hex, 16)
    if network == "mainnet" and chain_id != 1:
        return f"chain_id_mismatch:{chain_id}"

    bal = await exec_rpc.get_balance(from_address)
    if bal is None:
        return "balance_query_failed"
    if Decimal(bal) < cfg.min_wallet_balance_eth * ETH:
        return f"wallet_balance_below_min:{bal}"

    pending = await _pending_probe_count(db)
    if pending >= MAX_PENDING_PROBES:
        return f"too_many_pending:{pending}"

    total_spent = await _wei_spent(db, window=None)
    if total_spent >= int(cfg.total_spend_cap_eth * ETH):
        return f"total_spend_cap_reached:{total_spent}"
    daily_spent = await _wei_spent(db, window="24 hours")
    if daily_spent >= int(cfg.daily_spend_cap_eth * ETH):
        return f"daily_spend_cap_reached:{daily_spent}"

    blob_base = await exec_rpc.blob_base_fee()
    if blob_base is None:
        return "blob_base_fee_unavailable"
    if Decimal(blob_base) > cfg.max_fee_per_blob_gas_gwei * GWEI:
        return f"blob_base_fee_above_cap:{blob_base}"

    return None


# ----------------------- submit + check ----------------------------------

class EthereumSelfProbe:
    """Real-send capable. Refuses unless every guardrail in
    `evaluate_guardrails` passes. Dry-run is always safe."""

    def __init__(
        self,
        db: DB,
        exec_rpc: ExecutionRPC,
        beacon: BeaconAPI,
        cfg: SelfProbeConfig,
        network: str,
    ):
        self.db = db
        self.exec_rpc = exec_rpc
        self.beacon = beacon
        self.cfg = cfg
        self.network = network
        # Derive sender from key at construction so we never trust env input.
        self._from: Optional[str] = None
        if cfg.private_key:
            try:
                from eth_account import Account
                self._from = Account.from_key(cfg.private_key).address
            except Exception:
                log.exception("failed to derive address from key")
                self._from = None
        # Default TO to FROM if operator didn't override.
        self._to = cfg.to_address or self._from
        # Mismatch guard: if operator pinned FROM_ADDRESS and it differs from
        # the key-derived one, refuse to ever submit.
        self._from_mismatch = (
            bool(cfg.from_address)
            and bool(self._from)
            and cfg.from_address.lower() != self._from.lower()
        )

    @property
    def from_address(self) -> Optional[str]:
        return self._from

    async def loop(self) -> None:
        if not self.cfg.enabled:
            log.info("self_probe disabled — loop will not start")
            return
        interval = max(60, self.cfg.interval_minutes * 60)
        log.warning(
            "self_probe loop starting",
            extra={"dry_run": self.cfg.dry_run, "interval_s": interval,
                   "from": self._from, "to": self._to},
        )
        if self._from_mismatch:
            log.error("ETH_PROBE_FROM_ADDRESS does not match key-derived address — "
                      "all submits will be refused")
        while True:
            try:
                await self.submit_one()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("self_probe submit_one failed")
            await asyncio.sleep(interval)

    async def submit_one(self) -> None:
        probe_id = f"ep_{int(time.time())}_{secrets.token_hex(4)}"
        now = datetime.now(timezone.utc)
        payload = make_blob_payload()
        payload_hash = hashlib.sha256(payload).hexdigest()

        if self._from_mismatch:
            await self._insert_probe_row(
                probe_id=probe_id, payload_hash=payload_hash,
                submit_status="refused", error="from_address_mismatch",
                now=now, tx_hash=None, cost_wei=None, versioned_hashes=None,
                submit_latency_ms=None,
            )
            return

        reason = await evaluate_guardrails(
            self.cfg, self.db, self.exec_rpc, self._from or "", network=self.network,
        )
        if reason is not None:
            status = "dry_run" if reason == "dry_run" else "refused"
            # Even in dry_run we compute versioned hashes so the row is fully
            # populated and usable for downstream observability.
            try:
                from ._kzg import versioned_hashes as _vh
                vh_list = _vh([payload])
            except Exception:
                vh_list = None
            await self._insert_probe_row(
                probe_id=probe_id, payload_hash=payload_hash,
                submit_status=status, error=reason, now=now, tx_hash=None,
                cost_wei=None, versioned_hashes=vh_list, submit_latency_ms=None,
            )
            log.info("self_probe %s", status,
                     extra={"probe_id": probe_id, "reason": reason})
            return

        # ---------- real send path ----------
        try:
            from eth_account import Account
        except ImportError:
            await self._insert_probe_row(
                probe_id=probe_id, payload_hash=payload_hash,
                submit_status="refused", error="eth_account_not_installed",
                now=now, tx_hash=None, cost_wei=None, versioned_hashes=None,
                submit_latency_ms=None,
            )
            return

        chain_id_hex = await self.exec_rpc.call("eth_chainId")
        nonce_hex = await self.exec_rpc.call(
            "eth_getTransactionCount", [self._from, "pending"]
        )
        if not (chain_id_hex and nonce_hex):
            await self._insert_probe_row(
                probe_id=probe_id, payload_hash=payload_hash,
                submit_status="refused", error="rpc_preflight_failed",
                now=now, tx_hash=None, cost_wei=None, versioned_hashes=None,
                submit_latency_ms=None,
            )
            return

        tx = {
            "type": 3,
            "chainId": int(chain_id_hex, 16),
            "nonce": int(nonce_hex, 16),
            "to": self._to,
            "value": 0,
            "gas": TX_EXEC_GAS,
            "maxFeePerGas":         int(self.cfg.max_fee_per_gas_gwei * GWEI),
            "maxPriorityFeePerGas": int(self.cfg.max_priority_fee_per_gas_gwei * GWEI),
            "maxFeePerBlobGas":     int(self.cfg.max_fee_per_blob_gas_gwei * GWEI),
        }

        # Pre-compute versioned hashes (we record these regardless of send outcome).
        from ._kzg import versioned_hashes as _vh
        try:
            vh_list = _vh([payload])
        except Exception as e:
            await self._insert_probe_row(
                probe_id=probe_id, payload_hash=payload_hash,
                submit_status="refused", error=f"kzg_failed:{type(e).__name__}",
                now=now, tx_hash=None, cost_wei=None, versioned_hashes=None,
                submit_latency_ms=None,
            )
            return

        started = time.monotonic()
        try:
            signed = Account.sign_transaction(tx, self.cfg.private_key, blobs=[payload])
            raw_hex = signed.raw_transaction.hex()
            if not raw_hex.startswith("0x"):
                raw_hex = "0x" + raw_hex
            tx_hash = await self.exec_rpc.call("eth_sendRawTransaction", [raw_hex])
        except Exception as e:
            await self._insert_probe_row(
                probe_id=probe_id, payload_hash=payload_hash,
                submit_status="refused",
                error=f"sign_or_send_failed:{type(e).__name__}:{str(e)[:200]}",
                now=now, tx_hash=None, cost_wei=None, versioned_hashes=vh_list,
                submit_latency_ms=int((time.monotonic() - started) * 1000),
            )
            log.exception("self_probe sign/send failed", extra={"probe_id": probe_id})
            return

        latency_ms = int((time.monotonic() - started) * 1000)
        if not tx_hash:
            # RPC accepted the call but returned no hash (e.g. error path)
            await self._insert_probe_row(
                probe_id=probe_id, payload_hash=payload_hash,
                submit_status="refused", error="send_returned_no_hash",
                now=now, tx_hash=None, cost_wei=None, versioned_hashes=vh_list,
                submit_latency_ms=latency_ms,
            )
            return

        await self._insert_probe_row(
            probe_id=probe_id, payload_hash=payload_hash,
            submit_status="pending", error=None, now=now,
            tx_hash=tx_hash, cost_wei=None,
            versioned_hashes=vh_list, submit_latency_ms=latency_ms,
        )
        for bucket, offset_s in SELF_PROBE_RETRIEVE_OFFSETS_SECONDS:
            due = now + timedelta(seconds=offset_s)
            await self.db.execute(
                """
                INSERT INTO probe_schedule
                  (target_type, target_id, slot, blob_index, due_at, age_bucket, status)
                VALUES ('self_probe', $1, NULL, NULL, $2, $3, 'pending')
                ON CONFLICT (target_type, target_id, age_bucket) DO NOTHING
                """,
                probe_id, due, bucket,
            )
        log.warning("self_probe submitted",
                    extra={"probe_id": probe_id, "tx_hash": tx_hash,
                           "vh": vh_list})

    async def check_retrieval(self, row: dict) -> None:
        """Called by SurvivalWorker for target_type='self_probe' rows."""
        probe_id = row["target_id"]
        bucket = row["age_bucket"]

        probe = await self.db.fetchrow(
            "SELECT tx_hash, payload_hash, blob_versioned_hashes, submit_timestamp "
            "FROM self_probe_ethereum WHERE probe_id = $1",
            probe_id,
        )
        if not probe or not probe["tx_hash"]:
            await self.db.execute(
                "UPDATE probe_schedule SET status='done' WHERE id=$1", row["id"]
            )
            return

        tx_hash = probe["tx_hash"]
        receipt = await self.exec_rpc.call("eth_getTransactionReceipt", [tx_hash])
        if not receipt:
            return  # not yet included; worker will retry on next tick

        block_number = int(receipt["blockNumber"], 16)
        gas_used       = int(receipt.get("gasUsed",         "0x0"), 16)
        eff_gas_price  = int(receipt.get("effectiveGasPrice","0x0"), 16)
        blob_gas_used  = int(receipt.get("blobGasUsed",  "0x0"), 16) if receipt.get("blobGasUsed")  else 0
        blob_gas_price = int(receipt.get("blobGasPrice", "0x0"), 16) if receipt.get("blobGasPrice") else 0
        cost = gas_used * eff_gas_price + blob_gas_used * blob_gas_price

        slot = await self.db.fetchval(
            "SELECT slot FROM eth_slots WHERE execution_block_number=$1", block_number
        )

        started = time.monotonic()
        success = False
        retrieved_hash: Optional[str] = None
        if slot is not None:
            data, _l, _s, _e = await self.beacon.blob_sidecars_timed(int(slot))
            if data:
                vhs = probe["blob_versioned_hashes"] or []
                vhs = json.loads(vhs) if isinstance(vhs, str) else list(vhs)
                target_vhs = {v.lower() for v in vhs if isinstance(v, str)}
                from ..observers.blob_sidecar import kzg_to_versioned_hash
                for sc in (data.get("data") or []):
                    blob_hex = sc.get("blob")
                    kzg = (sc.get("kzg_commitment") or "").lower()
                    vh = kzg_to_versioned_hash(kzg) if kzg else None
                    if vh and vh.lower() in target_vhs and blob_hex:
                        try:
                            raw = bytes.fromhex(blob_hex.removeprefix("0x"))
                            retrieved_hash = hashlib.sha256(raw).hexdigest()
                            success = True
                            break
                        except ValueError:
                            pass
        latency_ms = int((time.monotonic() - started) * 1000)
        data_match = (retrieved_hash == probe["payload_hash"]) if retrieved_hash else None
        age_hours = (
            int((datetime.now(timezone.utc) - probe["submit_timestamp"]).total_seconds() / 3600)
            if probe["submit_timestamp"] else None
        )

        await self.db.execute(
            """
            UPDATE self_probe_ethereum
               SET submit_cost_wei     = COALESCE(submit_cost_wei, $2),
                   gas_used            = COALESCE(gas_used, $8),
                   effective_gas_price = COALESCE(effective_gas_price, $9),
                   blob_gas_used       = COALESCE(blob_gas_used, $10),
                   blob_gas_price      = COALESCE(blob_gas_price, $11),
                   submit_status       = CASE WHEN submit_status='pending'
                                              THEN 'included' ELSE submit_status END,
                   retrieve_timestamp  = now(),
                   retrieve_latency_ms = $3,
                   retrieve_success    = $4,
                   retrieve_data_hash  = $5,
                   data_match          = $6,
                   blob_age_hours      = $7
             WHERE probe_id = $1
            """,
            probe_id, cost, latency_ms, success, retrieved_hash, data_match, age_hours,
            gas_used, eff_gas_price, blob_gas_used, blob_gas_price,
        )
        if slot is not None:
            await self.db.execute(
                """
                INSERT INTO eth_blob_survival
                  (slot, blob_index, age_bucket, age_hours, checked_at,
                   available, reconstructable, latency_ms, error_type, http_status)
                VALUES ($1, NULL, $2, $3, now(), $4, NULL, $5, NULL, NULL)
                ON CONFLICT (slot, blob_index, age_bucket) DO UPDATE SET
                  checked_at = EXCLUDED.checked_at,
                  age_hours  = EXCLUDED.age_hours,
                  available  = EXCLUDED.available,
                  latency_ms = EXCLUDED.latency_ms
                """,
                int(slot), bucket, age_hours, success, latency_ms,
            )
        await self.db.execute(
            "UPDATE probe_schedule SET status='done' WHERE id=$1", row["id"]
        )
        log.info("self_probe retrieval",
                 extra={"probe_id": probe_id, "bucket": bucket,
                        "success": success, "data_match": data_match})

    async def _insert_probe_row(
        self, *, probe_id: str, payload_hash: str, submit_status: str,
        error: Optional[str], now: datetime, tx_hash: Optional[str],
        cost_wei: Optional[int], versioned_hashes: Optional[list],
        submit_latency_ms: Optional[int],
    ) -> None:
        await self.db.execute(
            """
            INSERT INTO self_probe_ethereum
              (probe_id, payload_hash, payload_size_bytes, submit_timestamp,
               submit_latency_ms, submit_identifier, tx_hash, from_address,
               to_address, submit_cost_wei, submit_status, max_fee_per_gas,
               max_fee_per_blob_gas, blob_versioned_hashes, error)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
            """,
            probe_id, payload_hash, BLOB_SIZE_BYTES, now,
            submit_latency_ms, probe_id, tx_hash,
            self._from, self._to, cost_wei, submit_status,
            int(self.cfg.max_fee_per_gas_gwei * GWEI),
            int(self.cfg.max_fee_per_blob_gas_gwei * GWEI),
            json.dumps(versioned_hashes) if versioned_hashes is not None else None,
            error,
        )
