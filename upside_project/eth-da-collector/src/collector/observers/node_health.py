from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from ..clients.beacon_api import BeaconAPI
from ..clients.execution_rpc import ExecutionRPC
from ..clients.lighthouse_metrics import LighthouseMetrics
from ..db import DB

log = logging.getLogger(__name__)


class NodeHealthObserver:
    """Every ~5 min: syncing, peer count, peer summary."""

    def __init__(self, db: DB, beacon: BeaconAPI, exec_rpc: ExecutionRPC,
                 metrics: LighthouseMetrics):
        self.db = db
        self.beacon = beacon
        self.exec_rpc = exec_rpc
        self.metrics = metrics

    async def tick(self) -> None:
        now = datetime.now(timezone.utc)

        syncing = await self.beacon.syncing()
        peer_count = await self.beacon.peer_count()
        peers_connected = await self.beacon.peers_connected()
        el_syncing = await self.exec_rpc.call("eth_syncing")
        el_peer_count_hex = await self.exec_rpc.call("net_peerCount")
        m = await self.metrics.fetch()

        s_data = (syncing or {}).get("data", {}) if isinstance(syncing, dict) else {}
        p_data = (peer_count or {}).get("data", {}) if isinstance(peer_count, dict) else {}

        def _int(v):
            try:
                return int(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        await self.db.execute(
            """
            INSERT INTO eth_node_health
              (timestamp, is_syncing, is_optimistic, el_offline, head_slot,
               sync_distance, execution_syncing, geth_peer_count,
               lighthouse_connected_peers)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
            ON CONFLICT (timestamp) DO NOTHING
            """,
            now,
            s_data.get("is_syncing"),
            s_data.get("is_optimistic"),
            s_data.get("el_offline"),
            _int(s_data.get("head_slot")),
            _int(s_data.get("sync_distance")),
            json.dumps(el_syncing) if el_syncing is not None else None,
            int(el_peer_count_hex, 16) if isinstance(el_peer_count_hex, str) else None,
            self.metrics.connected_peers(m) if m else _int(p_data.get("connected")),
        )

        # peer summary: store counts; full peer list lives only in JSONB.
        summary = None
        if isinstance(peers_connected, dict):
            data = peers_connected.get("data") or []
            # keep only small per-peer metadata, not the full peer object
            summary = [
                {
                    "peer_id": p.get("peer_id"),
                    "direction": p.get("direction"),
                    "agent": (p.get("agent_version") or "")[:80],
                }
                for p in data[:200]
            ]
        await self.db.execute(
            """
            INSERT INTO eth_peers
              (timestamp, connected, connecting, disconnected, disconnecting, peer_summary)
            VALUES ($1,$2,$3,$4,$5,$6::jsonb)
            ON CONFLICT (timestamp) DO NOTHING
            """,
            now,
            _int(p_data.get("connected")),
            _int(p_data.get("connecting")),
            _int(p_data.get("disconnected")),
            _int(p_data.get("disconnecting")),
            json.dumps(summary) if summary is not None else None,
        )
        log.info("node health tick",
                 extra={"is_syncing": s_data.get("is_syncing"),
                        "head_slot": s_data.get("head_slot"),
                        "connected_peers": p_data.get("connected")})
