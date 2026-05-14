from __future__ import annotations

import json
import logging
from typing import Any, Optional

from ..clients.execution_rpc import ExecutionRPC
from ..db import DB
from ..utils import hex_to_int

log = logging.getLogger(__name__)


def _is_blob_tx(tx: dict) -> bool:
    t = tx.get("type")
    if isinstance(t, str):
        return int(t, 16) == 3
    return t == 3


async def fetch_execution_block(rpc: ExecutionRPC, number: int) -> Optional[dict]:
    """eth_getBlockByNumber with full transactions."""
    return await rpc.get_block_by_number(number, full_tx=True)


async def fetch_receipts(rpc: ExecutionRPC, number: int) -> dict[str, dict]:
    """Best-effort: returns {tx_hash: receipt}. Empty dict on failure."""
    raw = await rpc.get_block_receipts(number)
    if not raw:
        return {}
    out: dict[str, dict] = {}
    for r in raw:
        h = r.get("transactionHash") or r.get("transaction_hash")
        if h:
            out[h.lower()] = r
    return out


async def write_blob_txs(
    db: DB, *, slot: int, exec_block: dict, receipts: dict[str, dict],
) -> int:
    """Insert/upsert type-3 txs from the execution block. Returns count written."""
    block_number = hex_to_int(exec_block.get("number"))
    txs = exec_block.get("transactions") or []
    count = 0
    for idx, tx in enumerate(txs):
        if not isinstance(tx, dict) or not _is_blob_tx(tx):
            continue
        tx_hash = (tx.get("hash") or "").lower()
        if not tx_hash:
            continue
        r = receipts.get(tx_hash, {})
        await db.execute(
            """
            INSERT INTO eth_blob_txs
              (tx_hash, slot, block_number, tx_index, sender, recipient,
               blob_count, blob_versioned_hashes, max_fee_per_blob_gas,
               status, blob_gas_used, blob_gas_price, rollup_name)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
            ON CONFLICT (tx_hash) DO UPDATE SET
              status         = EXCLUDED.status,
              blob_gas_used  = COALESCE(EXCLUDED.blob_gas_used, eth_blob_txs.blob_gas_used),
              blob_gas_price = COALESCE(EXCLUDED.blob_gas_price, eth_blob_txs.blob_gas_price)
            """,
            tx_hash,
            slot,
            block_number,
            idx,
            (tx.get("from") or "").lower() or None,
            (tx.get("to") or "").lower() if tx.get("to") else None,
            len(tx.get("blobVersionedHashes") or []),
            json.dumps(tx.get("blobVersionedHashes") or []),
            hex_to_int(tx.get("maxFeePerBlobGas")),
            hex_to_int(r.get("status")) if r else None,
            hex_to_int(r.get("blobGasUsed") or r.get("blob_gas_used")) if r else None,
            hex_to_int(r.get("blobGasPrice") or r.get("blob_gas_price")) if r else None,
            None,  # rollup_name — joined in later via l2_addressbook
        )
        count += 1
    return count


def execution_summary(exec_block: dict) -> dict[str, Any]:
    """Extract the numeric fields we store on eth_slots."""
    return {
        "block_number":   hex_to_int(exec_block.get("number")),
        "block_hash":     exec_block.get("hash"),
        "timestamp_unix": hex_to_int(exec_block.get("timestamp")),
        "blob_gas_used":  hex_to_int(exec_block.get("blobGasUsed")),
        "excess_blob_gas": hex_to_int(exec_block.get("excessBlobGas")),
        "base_fee_per_gas": hex_to_int(exec_block.get("baseFeePerGas")),
    }
