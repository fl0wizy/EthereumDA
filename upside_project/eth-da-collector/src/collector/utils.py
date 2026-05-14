from __future__ import annotations

import asyncio
import logging
import random
from typing import Any, Awaitable, Callable, Optional

log = logging.getLogger(__name__)

# Ethereum mainnet genesis (Beacon chain) for slot<->time conversion.
# https://ethereum.org/en/roadmap/merge/#consensus-layer-genesis
GENESIS_UNIX = 1606824023
SECONDS_PER_SLOT = 12
SLOTS_PER_EPOCH = 32


def slot_to_unix(slot: int) -> int:
    return GENESIS_UNIX + slot * SECONDS_PER_SLOT


def epoch_of(slot: int) -> int:
    return slot // SLOTS_PER_EPOCH


def hex_to_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    s = str(value)
    return int(s, 16) if s.startswith(("0x", "-0x", "0X")) else int(s)


async def backoff_call(
    fn: Callable[[], Awaitable[Any]],
    *,
    attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 5.0,
    retry_on: tuple[type[BaseException], ...] = (Exception,),
) -> Any:
    """Retry an async call with exponential backoff + jitter. Re-raises last
    exception on failure. Cancellation propagates immediately."""
    last_exc: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await fn()
        except asyncio.CancelledError:
            raise
        except retry_on as exc:
            last_exc = exc
            if attempt == attempts:
                break
            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            delay += random.uniform(0, delay * 0.1)
            log.debug("retrying after error: %s (attempt %d/%d, sleep %.2fs)",
                      exc, attempt, attempts, delay)
            await asyncio.sleep(delay)
    assert last_exc is not None
    raise last_exc


class TickLoop:
    """Run an async function on a fixed interval. Catches exceptions per
    tick so a single bad tick never kills the loop."""

    def __init__(self, name: str, interval_seconds: float,
                 fn: Callable[[], Awaitable[None]]):
        self.name = name
        self.interval = interval_seconds
        self.fn = fn
        self._log = logging.getLogger(f"loop.{name}")

    async def run(self) -> None:
        self._log.info("loop start", extra={"interval_s": self.interval})
        while True:
            start = asyncio.get_running_loop().time()
            try:
                await self.fn()
            except asyncio.CancelledError:
                self._log.info("loop cancelled")
                raise
            except Exception:
                self._log.exception("loop tick failed")
            elapsed = asyncio.get_running_loop().time() - start
            await asyncio.sleep(max(0.0, self.interval - elapsed))
