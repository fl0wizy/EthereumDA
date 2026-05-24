"""One-shot blob tx test that broadcasts via a public RPC and verifies
retrieval against the local Lighthouse. Mirrors the production self_probe
flow, but bypasses the local (unsynced) Reth.

Usage:
    .venv/bin/python scripts/probe_via_public_rpc.py
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

# Load .env (the collector uses python-dotenv; we replicate just enough).
for line in (ROOT / ".env").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    os.environ.setdefault(k.strip(), v.strip())

from eth_account import Account                                # noqa: E402
from collector.self_probe._kzg import versioned_hashes         # noqa: E402

PUBLIC_RPC  = os.environ.get("PUBLIC_RPC_URL",
                             "https://ethereum-rpc.publicnode.com")
BEACON_URL  = os.environ["BEACON_API_URL"].rstrip("/")
PRIVATE_KEY = os.environ["ETH_PROBE_PRIVATE_KEY"]
DB_URL      = os.environ["DATABASE_URL"]

BLOB_SIZE = 131072
TX_EXEC_GAS = 21000


def make_payload() -> bytes:
    buf = bytearray(BLOB_SIZE)
    buf[0] = 0
    buf[1:5] = b"EDA1"
    buf[5:32] = secrets.token_bytes(27)
    for i in range(32, BLOB_SIZE, 32):
        buf[i] = 0
        buf[i + 1:i + 32] = secrets.token_bytes(31)
    return bytes(buf)


async def rpc(client: httpx.AsyncClient, url: str, method: str, params=None):
    r = await client.post(url, json={"jsonrpc": "2.0", "method": method,
                                     "params": params or [], "id": 1},
                          timeout=30)
    r.raise_for_status()
    body = r.json()
    if "error" in body:
        raise RuntimeError(f"{method} -> {body['error']}")
    return body.get("result")


async def wait_for_receipt(client, tx_hash, *, max_wait_s=600, every=6):
    deadline = time.time() + max_wait_s
    while time.time() < deadline:
        r = await rpc(client, PUBLIC_RPC, "eth_getTransactionReceipt", [tx_hash])
        if r:
            return r
        await asyncio.sleep(every)
    raise TimeoutError(f"no receipt after {max_wait_s}s")


async def lookup_block_root(block_number: int) -> tuple[int, str]:
    """SELECT slot, block_root FROM eth_slots, retrying until the collector
    indexes the slot containing block_number."""
    import asyncpg
    conn = await asyncpg.connect(DB_URL)
    try:
        deadline = time.time() + 90
        while time.time() < deadline:
            row = await conn.fetchrow(
                "SELECT slot, block_root FROM eth_slots "
                "WHERE execution_block_number=$1", block_number,
            )
            if row and row["block_root"]:
                return int(row["slot"]), row["block_root"]
            await asyncio.sleep(4)
        raise TimeoutError(f"slot for block {block_number} not indexed in 90s")
    finally:
        await conn.close()


async def retrieve_and_verify(client, block_root: str, expected_vhs: set[str],
                              expected_payload_hash: str) -> dict:
    r = await client.get(f"{BEACON_URL}/eth/v1/beacon/blob_sidecars/{block_root}",
                         timeout=30)
    if r.status_code != 200:
        return {"http": r.status_code, "matched": False, "data_match": False,
                "error": f"beacon_http_{r.status_code}"}
    sidecars = (r.json() or {}).get("data") or []
    for sc in sidecars:
        kzg = (sc.get("kzg_commitment") or "").removeprefix("0x")
        if not kzg:
            continue
        h = hashlib.sha256(bytes.fromhex(kzg)).digest()
        vh = "0x01" + h[1:].hex()
        if vh.lower() not in expected_vhs:
            continue
        blob_raw = bytes.fromhex((sc.get("blob") or "").removeprefix("0x"))
        payload_h = hashlib.sha256(blob_raw).hexdigest()
        return {"http": 200, "matched": True, "blob_index": sc["index"],
                "data_match": payload_h == expected_payload_hash,
                "retrieved_hash": payload_h}
    return {"http": 200, "matched": False, "data_match": False,
            "error": "vh_not_matched", "sidecar_count": len(sidecars)}


async def main():
    addr = Account.from_key(PRIVATE_KEY).address
    print(f"from: {addr}")
    print(f"public RPC: {PUBLIC_RPC}")

    async with httpx.AsyncClient() as client:
        # Preflight
        bal = int(await rpc(client, PUBLIC_RPC, "eth_getBalance", [addr, "latest"]), 16)
        nonce = int(await rpc(client, PUBLIC_RPC, "eth_getTransactionCount", [addr, "pending"]), 16)
        chain_id = int(await rpc(client, PUBLIC_RPC, "eth_chainId"), 16)
        blob_base = int(await rpc(client, PUBLIC_RPC, "eth_blobBaseFee"), 16)
        prio = int(await rpc(client, PUBLIC_RPC, "eth_maxPriorityFeePerGas"), 16)
        gas_price = int(await rpc(client, PUBLIC_RPC, "eth_gasPrice"), 16)
        print(f"chain_id={chain_id}  nonce={nonce}  bal={bal/1e18:.6f} ETH  "
              f"gas_price={gas_price/1e9:.3f}gw  blob_base={blob_base/1e9:.6f}gw  "
              f"prio={prio/1e9:.6f}gw")

        # Build + sign
        payload = make_payload()
        payload_hash = hashlib.sha256(payload).hexdigest()
        vhs = versioned_hashes([payload])
        # Fee strategy: 2x current base for inclusion margin, generous blob fee.
        max_fee = max(int(gas_price * 2), 1_500_000_000)            # >= 1.5 gwei
        max_prio = max(prio, 100_000_000)                            # >= 0.1 gwei
        max_blob = max(int(blob_base * 4), 1_000_000_000)            # >= 1 gwei
        tx = {
            "type": 3,
            "chainId": chain_id,
            "nonce": nonce,
            "to": addr,
            "value": 0,
            "gas": TX_EXEC_GAS,
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": max_prio,
            "maxFeePerBlobGas": max_blob,
        }
        print(f"tx fees: maxFeePerGas={max_fee/1e9:.3f}gw "
              f"maxFeePerBlobGas={max_blob/1e9:.3f}gw")
        print(f"vh: {vhs}")

        signed = Account.sign_transaction(tx, PRIVATE_KEY, blobs=[payload])
        raw = signed.raw_transaction.hex()
        if not raw.startswith("0x"):
            raw = "0x" + raw
        print(f"signed size: {len(raw)//2} bytes  payload_hash: {payload_hash}")

        # Broadcast
        t0 = time.monotonic()
        tx_hash = await rpc(client, PUBLIC_RPC, "eth_sendRawTransaction", [raw])
        submit_ms = int((time.monotonic() - t0) * 1000)
        print(f"\n[BROADCAST] tx_hash={tx_hash}  submit_latency={submit_ms}ms")

        # Wait for inclusion
        receipt = await wait_for_receipt(client, tx_hash)
        block_num = int(receipt["blockNumber"], 16)
        actual_cost = (int(receipt.get("gasUsed", "0x0"), 16)
                       * int(receipt.get("effectiveGasPrice", "0x0"), 16)
                       + int(receipt.get("blobGasUsed", "0x0"), 16)
                       * int(receipt.get("blobGasPrice", "0x0"), 16))
        print(f"[INCLUDED] block={block_num}  cost={actual_cost/1e18:.8f} ETH "
              f"(~${actual_cost/1e18*2600:.4f})")

        # Wait for collector to index the slot
        slot, block_root = await lookup_block_root(block_num)
        print(f"[INDEXED]  slot={slot}  block_root={block_root}")

        # Retrieve immediately
        target_vhs = {v.lower() for v in vhs}
        result = await retrieve_and_verify(client, block_root, target_vhs, payload_hash)
        print(f"\n[RETRIEVE immediate] {json.dumps(result, indent=2)}")

        # Also wait 60s and try again (post-finalization-ish)
        await asyncio.sleep(60)
        result2 = await retrieve_and_verify(client, block_root, target_vhs, payload_hash)
        print(f"\n[RETRIEVE +60s] {json.dumps(result2, indent=2)}")


if __name__ == "__main__":
    asyncio.run(main())
