from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

from ..errors import ErrorRecorder
from ..utils import backoff_call

log = logging.getLogger(__name__)


class BeaconAPI:
    """Lighthouse beacon HTTP API client. Errors are recorded, not raised."""

    def __init__(self, base_url: str, errors: ErrorRecorder, timeout_s: float = 15.0):
        self._base = base_url.rstrip("/")
        self._errors = errors
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_s),
            limits=httpx.Limits(max_keepalive_connections=4, max_connections=8),
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_json(self, path: str, *, slot: Optional[int] = None) -> Any:
        return await self._get_json(path, slot=slot)

    async def _get_json(self, path: str, *, slot: Optional[int] = None) -> Any:
        url = f"{self._base}{path}"
        started = time.monotonic()

        async def _do():
            resp = await self._client.get(url)
            # 404 on blob_sidecars for a slot with no blobs is normal — caller may
            # decide. We surface it via http_status and return None.
            if resp.status_code == 404:
                return {"__status": 404}
            resp.raise_for_status()
            return resp.json()

        try:
            result = await backoff_call(_do, attempts=3)
            if isinstance(result, dict) and result.get("__status") == 404:
                return None
            return result
        except httpx.HTTPStatusError as e:
            await self._errors.record(
                source="beacon_api", endpoint=path, slot=slot,
                error_type="http_status",
                http_status=e.response.status_code if e.response else None,
                latency_ms=int((time.monotonic() - started) * 1000),
                message=str(e),
            )
            return None
        except Exception as e:
            await self._errors.record(
                source="beacon_api", endpoint=path, slot=slot,
                error_type=type(e).__name__,
                latency_ms=int((time.monotonic() - started) * 1000),
                message=str(e),
            )
            return None

    # ---- endpoints used by MVP ------------------------------------------

    async def syncing(self) -> Any:
        return await self._get_json("/eth/v1/node/syncing")

    async def peer_count(self) -> Any:
        return await self._get_json("/eth/v1/node/peer_count")

    async def peers_connected(self) -> Any:
        return await self._get_json("/eth/v1/node/peers?state=connected")

    async def finality_checkpoints(self) -> Any:
        return await self._get_json("/eth/v1/beacon/states/head/finality_checkpoints")

    async def identity(self) -> Any:
        return await self._get_json("/eth/v1/node/identity")

    async def custody_info(self) -> Any:
        return await self._get_json("/lighthouse/custody/info")

    async def lighthouse_peers(self) -> Any:
        """Returns the full peer list with score + client info.
        Lighthouse-specific; not part of standard beacon API."""
        return await self._get_json("/lighthouse/peers")

    async def spec(self) -> Any:
        return await self._get_json("/eth/v1/config/spec")

    async def version(self) -> Any:
        return await self._get_json("/eth/v1/node/version")

    async def block(self, slot: int | str) -> Any:
        return await self._get_json(f"/eth/v2/beacon/blocks/{slot}",
                                    slot=slot if isinstance(slot, int) else None)

    async def blob_sidecars(self, slot: int) -> Any:
        # Returns 200 with {"data":[...]} or 404 if not found.
        return await self._get_json(f"/eth/v1/beacon/blob_sidecars/{slot}", slot=slot)

    async def headers(self, slot: int) -> Any:
        return await self._get_json(f"/eth/v1/beacon/headers/{slot}", slot=slot)

    # Latency-measuring variant for survival checks; returns
    # (data_or_none, latency_ms, http_status, error_type)
    async def blob_sidecars_timed(self, slot: int):
        url = f"{self._base}/eth/v1/beacon/blob_sidecars/{slot}"
        started = time.monotonic()
        try:
            resp = await self._client.get(url)
            latency = int((time.monotonic() - started) * 1000)
            if resp.status_code == 404:
                return None, latency, 404, "not_found"
            resp.raise_for_status()
            return resp.json(), latency, resp.status_code, None
        except httpx.HTTPStatusError as e:
            return None, int((time.monotonic() - started) * 1000), \
                   (e.response.status_code if e.response else None), "http_status"
        except Exception as e:
            return None, int((time.monotonic() - started) * 1000), None, type(e).__name__
