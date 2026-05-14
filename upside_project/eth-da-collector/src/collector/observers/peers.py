from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from ..clients.beacon_api import BeaconAPI
from ..db import DB

log = logging.getLogger(__name__)


def _safe_get(obj: Any, *path, default=None):
    cur = obj
    for k in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur


def _extract_score(peer_info: dict) -> Optional[float]:
    """Lighthouse nests score variably across versions."""
    s = peer_info.get("score")
    if isinstance(s, (int, float)):
        return float(s)
    if isinstance(s, dict):
        # {"score": {"score": N}} or {"score": N}
        inner = s.get("score")
        if isinstance(inner, (int, float)):
            return float(inner)
        # {"Real": {"score": N}}
        real = s.get("Real")
        if isinstance(real, dict):
            v = real.get("score")
            if isinstance(v, (int, float)):
                return float(v)
    return None


def _extract_ip(peer_info: dict) -> Optional[str]:
    """Parse first ip4/ip6 address out of seen_addresses or listening_addresses.
    Multiaddr form: '/ip4/1.2.3.4/tcp/9000/p2p/...'"""
    for key in ("seen_addresses", "listening_addresses", "address"):
        addrs = peer_info.get(key)
        if not addrs:
            continue
        if isinstance(addrs, str):
            addrs = [addrs]
        for a in addrs:
            if not isinstance(a, str):
                continue
            parts = a.split("/")
            for i, p in enumerate(parts):
                if p in ("ip4", "ip6") and i + 1 < len(parts):
                    return parts[i + 1]
    return None


class PeersObserver:
    """Polls Lighthouse /lighthouse/peers and writes one row per peer per tick.
    Skips silently if the endpoint isn't available."""

    def __init__(self, db: DB, beacon: BeaconAPI):
        self.db = db
        self.beacon = beacon

    async def tick(self) -> None:
        data = await self.beacon.lighthouse_peers()
        if not data:
            return

        # Lighthouse returns either a plain list or {"data":[...]} depending on version.
        peers = data if isinstance(data, list) else (data.get("data") or [])
        if not peers:
            return

        now = datetime.now(timezone.utc)
        rows = []
        for entry in peers:
            if not isinstance(entry, dict):
                continue
            peer_id = entry.get("peer_id")
            info = entry.get("peer_info") or entry
            if not peer_id:
                continue
            client = info.get("client") if isinstance(info.get("client"), dict) else {}
            rows.append((
                now,
                peer_id,
                client.get("agent_string") or info.get("agent_version"),
                client.get("kind") or info.get("client_kind"),
                _extract_score(info),
                _safe_get(info, "connection_status", "status")
                    or _safe_get(info, "connection_status")
                    or info.get("state"),
                info.get("connection_direction") or info.get("direction"),
                _extract_ip(info),
            ))

        if not rows:
            return

        # Bulk insert; ON CONFLICT to be safe if the same tick gets retried.
        async with self.db.pool.acquire() as con:
            await con.executemany(
                """
                INSERT INTO eth_peer_scores
                  (timestamp, peer_id, agent_version, client_kind,
                   score, state, direction, enr_ip)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT (timestamp, peer_id) DO NOTHING
                """,
                rows,
            )
        # Summary in logs (no per-peer spam)
        by_client: dict[str, int] = {}
        for r in rows:
            k = (r[3] or "unknown")
            by_client[k] = by_client.get(k, 0) + 1
        log.info("peer scores recorded",
                 extra={"peers": len(rows), "by_client": by_client})
