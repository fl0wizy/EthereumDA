from __future__ import annotations

import logging
import re
from pathlib import Path

from .db import DB

log = logging.getLogger(__name__)

_VERSION_RE = re.compile(r"^(\d+)_.*\.sql$")


async def run_migrations(db: DB, migrations_dir: Path) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    BIGINT PRIMARY KEY,
            filename   TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    applied = {
        r["version"] for r in await db.fetch("SELECT version FROM schema_migrations")
    }

    files = []
    for p in sorted(migrations_dir.iterdir()):
        m = _VERSION_RE.match(p.name)
        if not m:
            continue
        files.append((int(m.group(1)), p))
    files.sort()

    for version, path in files:
        if version in applied:
            continue
        sql = path.read_text(encoding="utf-8")
        log.info("applying migration", extra={"version": version, "file": path.name})
        async with db.pool.acquire() as con:
            async with con.transaction():
                await con.execute(sql)
                await con.execute(
                    "INSERT INTO schema_migrations(version, filename) VALUES($1, $2)",
                    version, path.name,
                )
    log.info("migrations up to date", extra={"applied": sorted(applied | {v for v, _ in files})})
