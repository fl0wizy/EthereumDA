from __future__ import annotations

import json
import logging

from ..clients.beacon_api import BeaconAPI
from ..clients.execution_rpc import ExecutionRPC
from ..config import Config
from ..db import DB

log = logging.getLogger(__name__)


async def collect_node_config(
    cfg: Config, db: DB, beacon: BeaconAPI, exec_rpc: ExecutionRPC,
) -> None:
    """One-shot at startup: chain id, spec, identity, custody, client versions."""
    chain_id_hex = await exec_rpc.call("eth_chainId")
    chain_id = int(chain_id_hex, 16) if chain_id_hex else None

    spec = await beacon.spec()
    identity = await beacon.identity()
    custody = await beacon.custody_info()
    bn_version = await beacon.version()
    el_version = await exec_rpc.call("web3_clientVersion")

    client_versions = {
        "execution": el_version,
        "consensus": (bn_version or {}).get("data", {}).get("version"),
    }
    spec_params = (spec or {}).get("data") if isinstance(spec, dict) else None
    custody_columns = (custody or {}).get("custody_subnet_indices") if isinstance(custody, dict) else custody

    await db.execute(
        """
        INSERT INTO eth_node_config
          (node_name, chain_id, client_versions, custody_columns, spec_params)
        VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)
        """,
        cfg.node_name,
        chain_id,
        json.dumps(client_versions),
        json.dumps(custody_columns) if custody_columns is not None else None,
        json.dumps(spec_params) if spec_params is not None else None,
    )
    log.info("node config recorded",
             extra={"chain_id": chain_id,
                    "el": client_versions["execution"],
                    "cl": client_versions["consensus"]})
