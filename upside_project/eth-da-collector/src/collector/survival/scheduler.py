from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Iterable, Tuple

from ..db import DB

log = logging.getLogger(__name__)


class SurvivalScheduler:
    """Inserts due_at rows into probe_schedule. Both observers and the
    self-probe submitter call this so all probe scheduling is in one place."""

    def __init__(self, db: DB, age_buckets: Iterable[Tuple[str, int]]):
        self.db = db
        self.age_buckets = tuple(age_buckets)

    async def schedule_blob_sidecar(self, *, slot: int, blob_index: int,
                                    slot_time: datetime) -> None:
        target_id = f"{slot}:{blob_index}"
        for bucket, hours in self.age_buckets:
            due = slot_time + timedelta(hours=hours)
            await self._insert(target_type="blob_sidecar", target_id=target_id,
                               slot=slot, blob_index=blob_index, due_at=due,
                               age_bucket=bucket)

    async def _insert(self, *, target_type: str, target_id: str,
                      slot: int | None, blob_index: int | None,
                      due_at: datetime, age_bucket: str) -> None:
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        await self.db.execute(
            """
            INSERT INTO probe_schedule
              (target_type, target_id, slot, blob_index, due_at, age_bucket, status)
            VALUES ($1,$2,$3,$4,$5,$6,'pending')
            ON CONFLICT (target_type, target_id, age_bucket) DO NOTHING
            """,
            target_type, target_id, slot, blob_index, due_at, age_bucket,
        )
