from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from ..clients.beacon_api import BeaconAPI
from ..config import Config
from ..db import DB
from ..survival.scheduler import SurvivalScheduler
from ..utils import slot_to_unix

log = logging.getLogger(__name__)


def kzg_to_versioned_hash(kzg_commitment_hex: str) -> Optional[str]:
    """EIP-4844 versioned hash: 0x01 || sha256(kzg_commitment)[1:]."""
    try:
        b = bytes.fromhex(kzg_commitment_hex.removeprefix("0x"))
        if len(b) != 48:
            return None
        h = hashlib.sha256(b).digest()
        return "0x01" + h[1:].hex()
    except ValueError:
        return None


class BlobSidecarProbe:
    """Fetch blob sidecars for a slot, store metadata, schedule survival probes.

    Stores ONLY metadata (kzg_commitment, versioned_hash). The blob payload
    itself is not persisted.
    """

    def __init__(self, db: DB, beacon: BeaconAPI, cfg: Config,
                 scheduler: SurvivalScheduler):
        self.db = db
        self.beacon = beacon
        self.cfg = cfg
        self.scheduler = scheduler

    async def run(self, slot: int, block_root: Optional[str] = None) -> None:
        started = time.monotonic()
        # Prefer block_root: it is reorg-stable and unambiguous for the
        # specific block we observed. Fall back to slot when unknown.
        query_id = block_root if block_root else slot
        data, latency_ms, http_status, err = await self.beacon.blob_sidecars_timed(query_id)
        if err and err != "not_found":
            # Placeholder row so the failure is visible. Use DO UPDATE so a
            # retry can refresh the error/latency/timestamp without inserting
            # duplicates. The placeholder (blob_index = -1) coexists with the
            # real (slot, 0..N) rows because they have different PK tuples.
            await self.db.execute(
                """
                INSERT INTO eth_blob_sidecars
                  (slot, blob_index, kzg_commitment, versioned_hash,
                   first_seen_at, latency_ms, available, matched_tx_hash, error)
                VALUES ($1, -1, '', NULL, now(), $2, false, NULL, $3)
                ON CONFLICT (slot, blob_index) DO UPDATE SET
                  first_seen_at = EXCLUDED.first_seen_at,
                  latency_ms    = EXCLUDED.latency_ms,
                  error         = EXCLUDED.error
                """,
                slot, latency_ms, f"{err}:{http_status}",
            )
            return
        if data is None:
            return  # 404: no blobs for this slot
        sidecars = data.get("data") or []
        if not sidecars:
            return

        # latency is for the whole batch; per-sidecar latency would require
        # one request per index which is too expensive here.
        from ..self_probe._kzg import verify_blob_kzg
        for sc in sidecars:
            try:
                idx = int(sc.get("index"))
            except (TypeError, ValueError):
                continue
            kzg = sc.get("kzg_commitment") or ""
            vh = kzg_to_versioned_hash(kzg) if kzg else None
            # KZG integrity: verify (blob, commitment, proof). NULL if any
            # field missing in the response; False if check failed; True if OK.
            blob_hex = sc.get("blob")
            proof_hex = sc.get("kzg_proof")
            kzg_ok: Optional[bool] = None
            if blob_hex and kzg and proof_hex:
                kzg_ok = verify_blob_kzg(blob_hex, kzg, proof_hex)
            await self.db.execute(
                """
                INSERT INTO eth_blob_sidecars
                  (slot, blob_index, kzg_commitment, versioned_hash,
                   first_seen_at, latency_ms, available, matched_tx_hash,
                   error, kzg_verified)
                VALUES ($1,$2,$3,$4, now(), $5, true, NULL, NULL, $6)
                ON CONFLICT (slot, blob_index) DO UPDATE SET
                  kzg_commitment = EXCLUDED.kzg_commitment,
                  versioned_hash = EXCLUDED.versioned_hash,
                  latency_ms     = EXCLUDED.latency_ms,
                  available      = true,
                  error          = NULL,
                  kzg_verified   = COALESCE(EXCLUDED.kzg_verified, eth_blob_sidecars.kzg_verified)
                """,
                slot, idx, kzg, vh, latency_ms, kzg_ok,
            )
            await self._match_tx(slot=slot, blob_index=idx, versioned_hash=vh)
            await self._schedule_survival(slot=slot, blob_index=idx)

        # Success — drop any prior error placeholder for this slot so the
        # retry worker stops considering it.
        await self.db.execute(
            "DELETE FROM eth_blob_sidecars WHERE slot=$1 AND blob_index=-1",
            slot,
        )

        log.info("blob sidecars stored",
                 extra={"slot": slot, "count": len(sidecars),
                        "latency_ms": latency_ms,
                        "wall_ms": int((time.monotonic() - started) * 1000),
                        "queried_by": "block_root" if block_root else "slot"})

    async def _match_tx(self, *, slot: int, blob_index: int,
                        versioned_hash: Optional[str]) -> None:
        if not versioned_hash:
            return
        # Find tx whose blob_versioned_hashes contains this hash. JSONB ? op.
        row = await self.db.fetchrow(
            """
            SELECT tx_hash
              FROM eth_blob_txs
             WHERE slot = $1
               AND blob_versioned_hashes ? $2
             LIMIT 1
            """,
            slot, versioned_hash,
        )
        if row:
            await self.db.execute(
                "UPDATE eth_blob_sidecars SET matched_tx_hash=$1 "
                "WHERE slot=$2 AND blob_index=$3",
                row["tx_hash"], slot, blob_index,
            )

    async def _schedule_survival(self, *, slot: int, blob_index: int) -> None:
        slot_time = datetime.fromtimestamp(slot_to_unix(slot), tz=timezone.utc)
        await self.scheduler.schedule_blob_sidecar(
            slot=slot, blob_index=blob_index, slot_time=slot_time,
        )

    async def retry_pending(self, *, limit: int = 32,
                            max_age_hours: int = 24) -> int:
        """Re-attempt slots that previously failed (placeholder rows with
        blob_index=-1). Bounded by `limit` per tick. Slots older than
        `max_age_hours` are skipped — Lighthouse has ~18 day blob retention
        but anything still missing after 24h is almost certainly a permanent
        miss (node was offline / unsubscribed / pre-supernode).

        Pulls block_root from eth_slots so the retry hits the canonical
        block by root, which is more robust than slot for reorged slots.
        Returns the number of slots retried.
        """
        rows = await self.db.fetch(
            """
            SELECT b.slot, s.block_root
              FROM eth_blob_sidecars b
              JOIN eth_slots s USING (slot)
             WHERE b.blob_index = -1
               AND b.error IS NOT NULL
               AND b.first_seen_at > now() - make_interval(hours => $2)
               AND s.blob_count > 0
             ORDER BY b.first_seen_at DESC
             LIMIT $1
            """,
            limit, max_age_hours,
        )
        if not rows:
            return 0
        for r in rows:
            try:
                await self.run(int(r["slot"]), block_root=r["block_root"])
            except Exception:
                log.exception("sidecar retry failed",
                              extra={"slot": int(r["slot"])})
        log.info("sidecar retry tick",
                 extra={"attempted": len(rows)})
        return len(rows)
