from __future__ import annotations

import logging
import re
import time
from typing import Dict

import httpx

from ..errors import ErrorRecorder
from ..utils import backoff_call

log = logging.getLogger(__name__)

# Match `metric_name{labels} value [timestamp]` and `metric_name value`
_METRIC_LINE = re.compile(
    r"^(?P<name>[a-zA-Z_:][a-zA-Z0-9_:]*)(?P<labels>\{[^}]*\})?\s+(?P<value>\S+)"
)


class LighthouseMetrics:
    """Pulls the Prometheus text endpoint and exposes a few well-known counters."""

    def __init__(self, url: str, errors: ErrorRecorder, timeout_s: float = 10.0):
        self._url = url
        self._errors = errors
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(timeout_s))

    async def aclose(self) -> None:
        await self._client.aclose()

    async def fetch(self) -> Dict[str, float] | None:
        started = time.monotonic()

        async def _do():
            resp = await self._client.get(self._url)
            resp.raise_for_status()
            return resp.text

        try:
            text = await backoff_call(_do, attempts=3)
        except httpx.HTTPStatusError as e:
            await self._errors.record(
                source="lighthouse_metrics", endpoint=self._url,
                error_type="http_status",
                http_status=e.response.status_code if e.response else None,
                latency_ms=int((time.monotonic() - started) * 1000),
                message=str(e),
            )
            return None
        except Exception as e:
            await self._errors.record(
                source="lighthouse_metrics", endpoint=self._url,
                error_type=type(e).__name__,
                latency_ms=int((time.monotonic() - started) * 1000),
                message=str(e),
            )
            return None

        out: Dict[str, float] = {}
        for line in text.splitlines():
            if not line or line.startswith("#"):
                continue
            m = _METRIC_LINE.match(line)
            if not m:
                continue
            name = m.group("name")
            try:
                out[name] = float(m.group("value"))
            except ValueError:
                continue
        return out

    @staticmethod
    def connected_peers(metrics: Dict[str, float]) -> int | None:
        # Lighthouse exposes libp2p_peers (gauge).
        for k in ("libp2p_peers", "beacon_peers_connected", "peers"):
            if k in metrics:
                return int(metrics[k])
        return None
