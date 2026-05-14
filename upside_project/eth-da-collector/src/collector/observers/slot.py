from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional, Tuple

from ..clients.beacon_api import BeaconAPI
from ..clients.execution_rpc import ExecutionRPC
from ..db import DB
from ..errors import ErrorRecorder
from .blob_sidecar import BlobSidecarProbe
from .execution import execution_summary, fetch_execution_block, fetch_receipts, write_blob_txs

log = logging.getLogger(__name__)

# Cap per tick to avoid runaway catch-up loops.
_MAX_SLOTS_PER_TICK = 8

# How often to refresh the cached node sync state (seconds).
_SYNC_REFRESH_S = 30.0


def _int(v) -> Optional[int]:
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


class SlotObserver:
    """Drives the per-slot pipeline:
       beacon header -> beacon block -> execution block + receipts ->
       eth_slots upsert -> blob_sidecar probe."""

    def __init__(
        self,
        db: DB,
        beacon: BeaconAPI,
        exec_rpc: ExecutionRPC,
        sidecar_probe: BlobSidecarProbe,
        errors: ErrorRecorder,
    ):
        self.db = db
        self.beacon = beacon
        self.exec_rpc = exec_rpc
        self.sidecar_probe = sidecar_probe
        self.errors = errors
        self._last_processed: Optional[int] = None
        self._sync_state: Tuple[Optional[bool], Optional[bool], float] = (None, None, 0.0)

    async def _refresh_sync_state(self) -> Tuple[Optional[bool], Optional[bool]]:
        is_syncing, is_optimistic, ts = self._sync_state
        if time.monotonic() - ts < _SYNC_REFRESH_S:
            return is_syncing, is_optimistic
        s = await self.beacon.syncing()
        if isinstance(s, dict):
            d = s.get("data", {}) or {}
            is_syncing = d.get("is_syncing")
            is_optimistic = d.get("is_optimistic")
        self._sync_state = (is_syncing, is_optimistic, time.monotonic())
        return is_syncing, is_optimistic

    async def _head_slot(self) -> Optional[int]:
        h = await self.beacon.get_json("/eth/v1/beacon/headers/head")
        if not isinstance(h, dict):
            return None
        return _int(((h.get("data") or {}).get("header") or {})
                    .get("message", {}).get("slot"))

    async def _bootstrap_last(self) -> None:
        if self._last_processed is not None:
            return
        row = await self.db.fetchval("SELECT max(slot) FROM eth_slots")
        # On cold start, start from current head to avoid backfilling history.
        if row is None:
            head = await self._head_slot()
            self._last_processed = (head - 1) if head else None
        else:
            self._last_processed = int(row)

    async def tick(self) -> None:
        await self._bootstrap_last()
        head = await self._head_slot()
        if head is None or self._last_processed is None:
            return
        if head <= self._last_processed:
            return

        is_syncing, is_optimistic = await self._refresh_sync_state()

        start = self._last_processed + 1
        end = min(head, start + _MAX_SLOTS_PER_TICK - 1)
        for slot in range(start, end + 1):
            try:
                processed = await self._process_slot(slot, is_syncing, is_optimistic)
            except Exception:
                log.exception("slot processing failed", extra={"slot": slot})
                await self.errors.record(
                    source="slot_observer", endpoint="process_slot", slot=slot,
                    error_type="unhandled", message="see logs",
                )
                processed = False
            # Advance the watermark even on empty slots so we don't retry forever.
            self._last_processed = slot
            if processed:
                pass

    async def _process_slot(
        self, slot: int, is_syncing: Optional[bool], is_optimistic: Optional[bool],
    ) -> bool:
        header = await self.beacon.headers(slot)
        if not header or "data" not in header:
            return False  # empty / missed slot
        h_data = header["data"]
        block_root = h_data.get("root")
        msg = (h_data.get("header") or {}).get("message", {}) or {}
        proposer_index = _int(msg.get("proposer_index"))

        block = await self.beacon.block(slot)
        if not block or "data" not in block:
            return False
        body = ((block["data"].get("message") or {}).get("body")) or {}
        commitments = body.get("blob_kzg_commitments") or []
        blob_count = len(commitments)
        exec_payload = body.get("execution_payload") or {}

        # Beacon API returns string-encoded ints. Execution RPC will give us
        # hex strings; keep the beacon ones as ints here.
        block_number = _int(exec_payload.get("block_number"))
        block_hash = exec_payload.get("block_hash")
        timestamp_unix = _int(exec_payload.get("timestamp"))
        slot_ts = (
            datetime.fromtimestamp(timestamp_unix, tz=timezone.utc)
            if timestamp_unix else None
        )

        await self.db.execute(
            """
            INSERT INTO eth_slots
              (slot, epoch, proposer_index, block_root, execution_block_number,
               execution_block_hash, timestamp, blob_count, blob_gas_used,
               excess_blob_gas, base_fee_per_gas, node_is_syncing, node_is_optimistic)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (slot) DO UPDATE SET
              proposer_index         = EXCLUDED.proposer_index,
              block_root             = EXCLUDED.block_root,
              execution_block_number = EXCLUDED.execution_block_number,
              execution_block_hash   = EXCLUDED.execution_block_hash,
              timestamp              = EXCLUDED.timestamp,
              blob_count             = EXCLUDED.blob_count,
              blob_gas_used          = EXCLUDED.blob_gas_used,
              excess_blob_gas        = EXCLUDED.excess_blob_gas,
              base_fee_per_gas       = EXCLUDED.base_fee_per_gas,
              node_is_syncing        = EXCLUDED.node_is_syncing,
              node_is_optimistic     = EXCLUDED.node_is_optimistic
            """,
            slot,
            slot // 32,
            proposer_index,
            block_root,
            block_number,
            block_hash,
            slot_ts,
            blob_count,
            _int(exec_payload.get("blob_gas_used")),
            _int(exec_payload.get("excess_blob_gas")),
            _int(exec_payload.get("base_fee_per_gas")),
            is_syncing,
            is_optimistic,
        )

        # Execution-side details. eth_getBlockByNumber gives us decoded txs;
        # the beacon execution_payload only has RLP. Receipts add per-tx status
        # and effective blob_gas_price.
        if block_number is not None and blob_count > 0:
            exec_block = await fetch_execution_block(self.exec_rpc, block_number)
            if exec_block:
                # Re-affirm the numeric fields directly from the execution client
                # in case any rounding/parsing differed.
                summary = execution_summary(exec_block)
                await self.db.execute(
                    """
                    UPDATE eth_slots SET
                      execution_block_hash = COALESCE($2, execution_block_hash),
                      blob_gas_used        = COALESCE($3, blob_gas_used),
                      excess_blob_gas      = COALESCE($4, excess_blob_gas),
                      base_fee_per_gas     = COALESCE($5, base_fee_per_gas)
                    WHERE slot = $1
                    """,
                    slot,
                    summary["block_hash"],
                    summary["blob_gas_used"],
                    summary["excess_blob_gas"],
                    summary["base_fee_per_gas"],
                )
                receipts = await fetch_receipts(self.exec_rpc, block_number)
                await write_blob_txs(self.db, slot=slot,
                                     exec_block=exec_block, receipts=receipts)

            await self.sidecar_probe.run(slot)

        log.info("slot processed",
                 extra={"slot": slot, "blob_count": blob_count,
                        "block_number": block_number})
        return True
