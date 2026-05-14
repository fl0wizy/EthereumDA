from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from ..errors import ErrorRecorder
from ..utils import backoff_call

log = logging.getLogger(__name__)


class ExecutionRPC:
    """Minimal JSON-RPC client. Records errors but does not crash the caller."""

    def __init__(self, base_url: str, errors: ErrorRecorder, timeout_s: float = 10.0):
        self._url = base_url
        self._errors = errors
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_s),
            limits=httpx.Limits(max_keepalive_connections=4, max_connections=8),
        )
        self._id = 0

    async def aclose(self) -> None:
        await self._client.aclose()

    async def call(self, method: str, params: list[Any] | None = None) -> Any:
        self._id += 1
        payload = {"jsonrpc": "2.0", "id": self._id, "method": method, "params": params or []}
        started = time.monotonic()

        async def _do() -> Any:
            resp = await self._client.post(self._url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"rpc error: {data['error']}")
            return data.get("result")

        try:
            return await backoff_call(_do, attempts=3)
        except httpx.HTTPStatusError as e:
            await self._errors.record(
                source="execution_rpc", endpoint=method,
                error_type="http_status",
                http_status=e.response.status_code if e.response else None,
                latency_ms=int((time.monotonic() - started) * 1000),
                message=str(e),
            )
            return None
        except Exception as e:
            await self._errors.record(
                source="execution_rpc", endpoint=method,
                error_type=type(e).__name__,
                latency_ms=int((time.monotonic() - started) * 1000),
                message=str(e),
            )
            return None

    # convenience wrappers
    async def block_number(self) -> int | None:
        r = await self.call("eth_blockNumber")
        return int(r, 16) if r else None

    async def get_block_by_number(self, num: int, full_tx: bool = True) -> dict | None:
        return await self.call("eth_getBlockByNumber", [hex(num), full_tx])

    async def get_block_receipts(self, num: int) -> list | None:
        return await self.call("eth_getBlockReceipts", [hex(num)])

    async def blob_base_fee(self) -> int | None:
        r = await self.call("eth_blobBaseFee")
        return int(r, 16) if r else None

    async def get_balance(self, address: str, block: str = "latest") -> int | None:
        r = await self.call("eth_getBalance", [address, block])
        return int(r, 16) if r else None
