"""Re-query Lighthouse for every (slot, blob_index) in eth_blob_survival
that previously failed (available=false). Updates rows in-place. Queries
by beacon block_root for reorg stability.

Usage:
    .venv/bin/python scripts/backfill_survival.py
"""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

import asyncpg
import httpx

ROOT = Path(__file__).resolve().parents[1]
for line in (ROOT / ".env").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    os.environ.setdefault(k.strip(), v.strip())

BEACON_URL = os.environ["BEACON_API_URL"].rstrip("/")
DB_URL     = os.environ["DATABASE_URL"]


async def backfill_one_slot(client, conn, slot, block_root, rows):
    """rows = list of (id, blob_index, age_bucket) for this slot."""
    t0 = time.monotonic()
    try:
        r = await client.get(
            f"{BEACON_URL}/eth/v1/beacon/blob_sidecars/{block_root}",
            timeout=20,
        )
    except Exception as e:
        return slot, "exception", str(e), 0
    latency_ms = int((time.monotonic() - t0) * 1000)
    if r.status_code != 200:
        return slot, "http", r.status_code, latency_ms
    sidecars = (r.json() or {}).get("data") or []
    available_idx = set()
    for sc in sidecars:
        try:
            available_idx.add(int(sc["index"]))
        except (KeyError, ValueError, TypeError):
            pass

    updated = 0
    for row_id, blob_index, _bucket in rows:
        is_avail = blob_index in available_idx if blob_index is not None else (len(available_idx) > 0)
        await conn.execute(
            """
            UPDATE eth_blob_survival
               SET available   = $2,
                   latency_ms  = $3,
                   error_type  = CASE WHEN $2 THEN NULL ELSE 'backfilled_missing_index' END,
                   http_status = 200,
                   checked_at  = now()
             WHERE id = $1
            """,
            row_id, is_avail, latency_ms,
        )
        updated += 1
    return slot, "ok", len(available_idx), updated


async def main():
    conn = await asyncpg.connect(DB_URL)
    try:
        rows = await conn.fetch(
            """
            SELECT s.id, s.slot, s.blob_index, s.age_bucket, e.block_root
              FROM eth_blob_survival s
              JOIN eth_slots e USING (slot)
             WHERE s.available = false
             ORDER BY s.slot
            """
        )
        if not rows:
            print("nothing to backfill")
            return
        # group by slot
        by_slot = {}
        for r in rows:
            by_slot.setdefault((r["slot"], r["block_root"]), []).append(
                (r["id"], r["blob_index"], r["age_bucket"])
            )
        print(f"backfilling {len(rows)} rows across {len(by_slot)} unique slots")

        # bounded concurrency
        sem = asyncio.Semaphore(6)
        results = []

        async with httpx.AsyncClient(http2=False) as client:
            async def worker(slot, root, rs):
                async with sem:
                    return await backfill_one_slot(client, conn, slot, root, rs)
            tasks = [worker(s, root, rs) for (s, root), rs in by_slot.items()]
            results = await asyncio.gather(*tasks)

        # Summary
        ok = sum(1 for r in results if r[1] == "ok")
        fail = len(results) - ok
        total_avail = sum(r[2] if r[1] == "ok" else 0 for r in results)
        total_updated = sum(r[3] if r[1] == "ok" else 0 for r in results)
        print(f"slots processed: {len(results)}  ok={ok}  fail={fail}")
        print(f"rows updated: {total_updated}")
        print(f"per-slot summary (slot status detail rows_updated):")
        for s, st, detail, upd in results:
            print(f"  {s}  {st}  {detail}  {upd}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
