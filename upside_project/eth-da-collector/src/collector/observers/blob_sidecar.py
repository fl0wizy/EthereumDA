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

    async def run(self, slot: int) -> None:
        started = time.monotonic()
        data, latency_ms, http_status, err = await self.beacon.blob_sidecars_timed(slot)
        if err and err != "not_found":
            await self.db.execute(
                """
                INSERT INTO eth_blob_sidecars
                  (slot, blob_index, kzg_commitment, versioned_hash,
                   first_seen_at, latency_ms, available, matched_tx_hash, error)
                VALUES ($1, -1, '', NULL, now(), $2, false, NULL, $3)
                ON CONFLICT (slot, blob_index) DO NOTHING
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
        for sc in sidecars:
            try:
                idx = int(sc.get("index"))
            except (TypeError, ValueError):
                continue
            kzg = sc.get("kzg_commitment") or ""
            vh = kzg_to_versioned_hash(kzg) if kzg else None
            await self.db.execute(
                """
                INSERT INTO eth_blob_sidecars
                  (slot, blob_index, kzg_commitment, versioned_hash,
                   first_seen_at, latency_ms, available, matched_tx_hash, error)
                VALUES ($1,$2,$3,$4, now(), $5, true, NULL, NULL)
                ON CONFLICT (slot, blob_index) DO UPDATE SET
                  kzg_commitment = EXCLUDED.kzg_commitment,
                  versioned_hash = EXCLUDED.versioned_hash,
                  latency_ms     = EXCLUDED.latency_ms,
                  available      = true,
                  error          = NULL
                """,
                slot, idx, kzg, vh, latency_ms,
            )
            await self._match_tx(slot=slot, blob_index=idx, versioned_hash=vh)
            await self._schedule_survival(slot=slot, blob_index=idx)

        log.info("blob sidecars stored",
                 extra={"slot": slot, "count": len(sidecars),
                        "latency_ms": latency_ms,
                        "wall_ms": int((time.monotonic() - started) * 1000)})

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
