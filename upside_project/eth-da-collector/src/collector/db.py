from __future__ import annotations

import asyncpg


class DB:
    """Thin wrapper around an asyncpg pool. Kept tiny on purpose."""

    def __init__(self, dsn: str):
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    async def connect(self, min_size: int = 1, max_size: int = 8) -> None:
        self._pool = await asyncpg.create_pool(
            self._dsn,
            min_size=min_size,
            max_size=max_size,
            command_timeout=30,
        )

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("DB not connected")
        return self._pool

    async def execute(self, sql: str, *args) -> str:
        async with self.pool.acquire() as con:
            return await con.execute(sql, *args)

    async def fetch(self, sql: str, *args):
        async with self.pool.acquire() as con:
            return await con.fetch(sql, *args)

    async def fetchrow(self, sql: str, *args):
        async with self.pool.acquire() as con:
            return await con.fetchrow(sql, *args)

    async def fetchval(self, sql: str, *args):
        async with self.pool.acquire() as con:
            return await con.fetchval(sql, *args)
