from __future__ import annotations

import logging
from typing import Optional

from .db import DB

log = logging.getLogger(__name__)


class ErrorRecorder:
    """Persists API/observation errors. Never raises — a failure here must
    not crash the caller's tick."""

    def __init__(self, db: DB):
        self.db = db

    async def record(
        self,
        *,
        source: str,
        error_type: str,
        endpoint: Optional[str] = None,
        slot: Optional[int] = None,
        column_index: Optional[int] = None,
        http_status: Optional[int] = None,
        latency_ms: Optional[int] = None,
        message: Optional[str] = None,
    ) -> None:
        try:
            await self.db.execute(
                """
                INSERT INTO eth_observation_errors
                  (source, endpoint, slot, column_index, error_type,
                   http_status, latency_ms, message)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                """,
                source, endpoint, slot, column_index, error_type,
                http_status, latency_ms, (message or "")[:2000],
            )
        except Exception:
            log.exception("failed to record error",
                          extra={"source": source, "error_type": error_type})
