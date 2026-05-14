from __future__ import annotations

import logging
from datetime import datetime, timezone

from ..clients.beacon_api import BeaconAPI
from ..db import DB

log = logging.getLogger(__name__)


class FinalityObserver:
    """Every epoch (~6.4 min): finality checkpoints."""

    def __init__(self, db: DB, beacon: BeaconAPI):
        self.db = db
        self.beacon = beacon

    async def tick(self) -> None:
        data = await self.beacon.finality_checkpoints()
        if not data or "data" not in data:
            return
        d = data["data"]
        prev = d.get("previous_justified", {}) or {}
        cur = d.get("current_justified", {}) or {}
        fin = d.get("finalized", {}) or {}

        def _int(v):
            try:
                return int(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        await self.db.execute(
            """
            INSERT INTO eth_finality
              (timestamp, previous_justified_epoch, current_justified_epoch,
               finalized_epoch, finalized_root)
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (timestamp) DO NOTHING
            """,
            datetime.now(timezone.utc),
            _int(prev.get("epoch")),
            _int(cur.get("epoch")),
            _int(fin.get("epoch")),
            fin.get("root"),
        )
        log.info("finality tick",
                 extra={"finalized_epoch": fin.get("epoch")})
