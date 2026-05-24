from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from ..db import DB
from ..errors import ErrorRecorder

log = logging.getLogger(__name__)


# Reconnect backoff bounds (seconds). SSE connection can drop on LH
# restart / network blip; reconnect indefinitely with capped backoff.
_BACKOFF_INITIAL = 1.0
_BACKOFF_MAX = 60.0


class GossipSSEObserver:
    """Subscribes to own Lighthouse SSE event stream and records:

      * `data_column_sidecar` topic -> eth_blob_sidecars.gossip_arrival_ts
        (the timestamp our mesh node actually received a column carrying
        this blob via libp2p gossip — distinct from polling-tick INSERT
        time). In Fulu/PeerDAS the blob-level `blob_sidecar` topic is
        effectively deprecated; gossip flows column-by-column, and each
        column event carries the versioned_hashes of every blob it cells.

      * `chain_reorg` topic -> eth_reorgs row (depth, old/new heads).

    Public beacon endpoints generally do NOT expose this stream; only own
    LH does. This is the single biggest measurement that justifies running
    a participating CL node.
    """

    def __init__(self, beacon_base_url: str, db: DB, errors: ErrorRecorder):
        self._url = (
            beacon_base_url.rstrip("/")
            + "/eth/v1/events?topics=data_column_sidecar,chain_reorg"
        )
        self.db = db
        self.errors = errors
        # Long-lived stream connection. timeout=None on read so the server
        # can hold the socket open between events without us tripping.
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=None))

    async def aclose(self) -> None:
        await self._client.aclose()

    async def run(self) -> None:
        backoff = _BACKOFF_INITIAL
        while True:
            try:
                await self._consume_stream()
                # If _consume_stream returns cleanly, server closed the
                # connection. Reconnect with small backoff to avoid hot loop.
                backoff = _BACKOFF_INITIAL
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("gossip SSE stream errored, will reconnect")
                await self.errors.record(
                    source="gossip_sse", endpoint=self._url,
                    error_type="stream_disconnect",
                    message="see logs",
                )
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, _BACKOFF_MAX)

    async def _consume_stream(self) -> None:
        async with self._client.stream(
            "GET", self._url,
            headers={"Accept": "text/event-stream"},
        ) as resp:
            resp.raise_for_status()
            current_event: Optional[str] = None
            async for line in resp.aiter_lines():
                if not line:
                    current_event = None
                    continue
                if line.startswith("event:"):
                    current_event = line[6:].strip()
                elif line.startswith("data:"):
                    payload_raw = line[5:].strip()
                    if not payload_raw or current_event is None:
                        continue
                    try:
                        payload = json.loads(payload_raw)
                    except json.JSONDecodeError:
                        continue
                    arrived_at = datetime.now(timezone.utc)
                    if current_event == "data_column_sidecar":
                        await self._handle_data_column_sidecar(payload, arrived_at)
                    elif current_event == "chain_reorg":
                        await self._handle_reorg(payload, arrived_at)

    async def _handle_data_column_sidecar(self, payload: dict,
                                          arrived_at: datetime) -> None:
        # Per Fulu spec: payload has block_root, slot, index (column index
        # 0..127), kzg_commitments[], versioned_hashes[]. The arrays are
        # aligned with blob index — versioned_hashes[j] is the EIP-4844
        # versioned_hash of the block's blob at blob_index = j.
        #
        # A node receives one event per custody column per slot. Different
        # columns of the same slot can arrive at different times, but for
        # the C2 "did the blob make the 4s deadline?" metric what matters
        # is the FIRST piece of evidence — i.e. the earliest column event
        # that names this blob. We COALESCE to preserve that first arrival.
        try:
            slot = int(payload.get("slot"))
        except (TypeError, ValueError):
            return
        vhs = payload.get("versioned_hashes") or []
        if not vhs:
            return
        for blob_idx, vh in enumerate(vhs):
            await self.db.execute(
                """
                INSERT INTO eth_blob_sidecars
                  (slot, blob_index, kzg_commitment, versioned_hash,
                   first_seen_at, gossip_arrival_ts, available,
                   matched_tx_hash, error)
                VALUES ($1, $2, '', $3, now(), $4, true, NULL, NULL)
                ON CONFLICT (slot, blob_index) DO UPDATE SET
                  gossip_arrival_ts = COALESCE(eth_blob_sidecars.gossip_arrival_ts,
                                               EXCLUDED.gossip_arrival_ts)
                """,
                slot, blob_idx, vh, arrived_at,
            )

    async def _handle_reorg(self, payload: dict, arrived_at: datetime) -> None:
        # Per spec: depth, old_head_block, new_head_block, old_head_state,
        # new_head_state, slot, epoch (some fields optional).
        try:
            slot = int(payload.get("slot"))
        except (TypeError, ValueError):
            return
        depth = _maybe_int(payload.get("depth"))
        epoch = _maybe_int(payload.get("epoch"))

        # Count sidecars from the old (reorged-out) head's slot range.
        # depth==N means the last N slots were reorged. We approximate by
        # counting blob sidecars in [slot-depth, slot-1] inclusive.
        affected_count: Optional[int] = None
        if depth is not None and depth > 0:
            row = await self.db.fetchrow(
                "SELECT count(*) AS n FROM eth_blob_sidecars "
                "WHERE slot BETWEEN $1 AND $2 AND blob_index >= 0",
                slot - depth, slot - 1,
            )
            affected_count = int(row["n"]) if row else 0

        await self.db.execute(
            """
            INSERT INTO eth_reorgs
              (timestamp, depth, slot, old_head_block, new_head_block,
               old_head_state, new_head_state, epoch, affected_blob_count)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (timestamp, slot) DO NOTHING
            """,
            arrived_at, depth, slot,
            payload.get("old_head_block"), payload.get("new_head_block"),
            payload.get("old_head_state"), payload.get("new_head_state"),
            epoch, affected_count,
        )
        log.warning("chain reorg observed",
                    extra={"slot": slot, "depth": depth,
                           "affected_blob_count": affected_count})


def _maybe_int(v) -> Optional[int]:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
