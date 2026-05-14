from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from ..clients.beacon_api import BeaconAPI
from ..db import DB
from ..utils import slot_to_unix

log = logging.getLogger(__name__)


_BATCH_SIZE = 32
_MAX_INFLIGHT = 4
_MAX_ATTEMPTS = 5


class SurvivalWorker:
    """Drains due rows in probe_schedule and writes results into
    eth_blob_survival (and via self_probe.check_* for self_probe targets)."""

    def __init__(self, db: DB, beacon: BeaconAPI,
                 self_probe_checker=None):
        self.db = db
        self.beacon = beacon
        self.self_probe_checker = self_probe_checker  # optional callable
        self._sem = asyncio.Semaphore(_MAX_INFLIGHT)

    async def tick(self) -> None:
        rows = await self.db.fetch(
            """
            UPDATE probe_schedule
               SET status = 'running',
                   attempt_count = attempt_count + 1
             WHERE id IN (
               SELECT id FROM probe_schedule
                WHERE status = 'pending' AND due_at <= now()
                ORDER BY due_at
                LIMIT $1
                FOR UPDATE SKIP LOCKED
             )
            RETURNING id, target_type, target_id, slot, blob_index,
                      age_bucket, attempt_count
            """,
            _BATCH_SIZE,
        )
        if not rows:
            return
        await asyncio.gather(*(self._run_one(dict(r)) for r in rows),
                             return_exceptions=False)

    async def _run_one(self, row: dict) -> None:
        async with self._sem:
            try:
                if row["target_type"] == "blob_sidecar":
                    await self._check_blob_sidecar(row)
                elif row["target_type"] == "self_probe" and self.self_probe_checker:
                    await self.self_probe_checker(row)
                else:
                    await self._mark_done(row["id"])
            except Exception as e:
                log.exception("survival check failed", extra={"row_id": row["id"]})
                await self._mark_failed(row["id"], row["attempt_count"], str(e))

    async def _check_blob_sidecar(self, row: dict) -> None:
        slot: int = row["slot"]
        blob_index: int = row["blob_index"]
        bucket: str = row["age_bucket"]

        data, latency_ms, http_status, err = await self.beacon.blob_sidecars_timed(slot)
        available = False
        error_type: Optional[str] = None
        if data is None:
            error_type = err or ("not_found" if http_status == 404 else "no_data")
        else:
            sidecars = (data or {}).get("data") or []
            for sc in sidecars:
                try:
                    if int(sc.get("index")) == blob_index:
                        available = True
                        break
                except (TypeError, ValueError):
                    continue
            if not available and error_type is None:
                error_type = "missing_index"

        age_hours = int(
            (datetime.now(timezone.utc).timestamp() - slot_to_unix(slot)) / 3600
        )

        await self.db.execute(
            """
            INSERT INTO eth_blob_survival
              (slot, blob_index, age_bucket, age_hours, checked_at,
               available, reconstructable, latency_ms, error_type, http_status)
            VALUES ($1,$2,$3,$4, now(), $5, NULL, $6, $7, $8)
            ON CONFLICT (slot, blob_index, age_bucket) DO UPDATE SET
              checked_at  = EXCLUDED.checked_at,
              age_hours   = EXCLUDED.age_hours,
              available   = EXCLUDED.available,
              latency_ms  = EXCLUDED.latency_ms,
              error_type  = EXCLUDED.error_type,
              http_status = EXCLUDED.http_status
            """,
            slot, blob_index, bucket, age_hours,
            available, latency_ms, error_type, http_status,
        )
        await self._mark_done(row["id"])
        log.info("survival check",
                 extra={"slot": slot, "blob_index": blob_index,
                        "age_bucket": bucket, "available": available,
                        "latency_ms": latency_ms})

    async def _mark_done(self, row_id: int) -> None:
        await self.db.execute(
            "UPDATE probe_schedule SET status='done' WHERE id=$1", row_id
        )

    async def _mark_failed(self, row_id: int, attempts: int, msg: str) -> None:
        # Re-queue until _MAX_ATTEMPTS, then give up.
        status = "pending" if attempts < _MAX_ATTEMPTS else "failed"
        await self.db.execute(
            "UPDATE probe_schedule SET status=$1, last_error=$2 WHERE id=$3",
            status, msg[:500], row_id,
        )
