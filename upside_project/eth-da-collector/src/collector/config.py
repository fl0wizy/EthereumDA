from __future__ import annotations

import os
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Tuple

from dotenv import load_dotenv

# Project root = three levels up from this file (src/collector/config.py).
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DOTENV_PATH = _PROJECT_ROOT / ".env"


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _str(name: str, default: str = "") -> str:
    v = os.getenv(name)
    return v if v is not None and v != "" else default


def _required(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"missing required env var: {name}")
    return v


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return int(raw)


def _dec(name: str, default: str) -> Decimal:
    raw = os.getenv(name)
    return Decimal(raw) if raw not in (None, "") else Decimal(default)


@dataclass(frozen=True)
class SelfProbeConfig:
    enabled: bool
    dry_run: bool
    private_key: str  # never log, never store
    from_address: str
    to_address: str
    interval_minutes: int
    total_spend_cap_eth: Decimal
    daily_spend_cap_eth: Decimal
    max_fee_per_gas_gwei: Decimal
    max_priority_fee_per_gas_gwei: Decimal
    max_fee_per_blob_gas_gwei: Decimal
    min_wallet_balance_eth: Decimal


@dataclass(frozen=True)
class Config:
    # endpoints
    execution_rpc_url: str
    beacon_api_url: str
    lighthouse_metrics_url: str
    database_url: str

    # identity / cadence
    node_name: str
    network: str
    slot_interval_seconds: int

    # feature flags
    enable_column_probes: bool
    enable_self_probe_ethereum: bool
    enable_batcher_balances: bool

    # logging
    log_level: str
    log_format: str

    self_probe: SelfProbeConfig = field(repr=False)

    # Survival schedule for observed public blobs (age bucket -> hours).
    # Kept here so it is testable and easy to extend.
    survival_age_buckets: Tuple[Tuple[str, int], ...] = (
        ("1d", 24),
        ("7d", 24 * 7),
        ("17d", 24 * 17),
        ("18d", 24 * 18),
        ("19d", 24 * 19),
    )

    # Optional public RPC fallback for EL queries (e.g. receipt lookup when
    # own EL is mid-sync). Empty string disables.
    public_execution_rpc_url: str = ""

    # Optional public beacon endpoints for multi-source retrieval (P2).
    # Tuple of (name, url) pairs. Built from `PUBLIC_BEACON_URLS` env var
    # (comma-separated URLs; name is auto-derived from hostname).
    public_beacon_endpoints: Tuple[Tuple[str, str], ...] = ()


def load_config() -> Config:
    # Explicit path: dotenv's caller-frame search misbehaves in some module
    # invocations. override=True so .env wins over stale shell exports.
    if _DOTENV_PATH.is_file():
        load_dotenv(_DOTENV_PATH, override=True)
    self_probe = SelfProbeConfig(
        enabled=_bool("ENABLE_SELF_PROBE_ETHEREUM", False),
        dry_run=_bool("ETH_PROBE_DRY_RUN", True),
        private_key=_str("ETH_PROBE_PRIVATE_KEY"),
        from_address=_str("ETH_PROBE_FROM_ADDRESS"),
        to_address=_str("ETH_PROBE_TO_ADDRESS"),
        interval_minutes=_int("ETH_PROBE_INTERVAL_MINUTES", 15),
        total_spend_cap_eth=_dec("ETH_PROBE_TOTAL_SPEND_CAP_ETH", "0.075"),
        daily_spend_cap_eth=_dec("ETH_PROBE_DAILY_SPEND_CAP_ETH", "0.006"),
        max_fee_per_gas_gwei=_dec("ETH_PROBE_MAX_FEE_PER_GAS_GWEI", "2"),
        max_priority_fee_per_gas_gwei=_dec("ETH_PROBE_MAX_PRIORITY_FEE_PER_GAS_GWEI", "0.1"),
        max_fee_per_blob_gas_gwei=_dec("ETH_PROBE_MAX_FEE_PER_BLOB_GAS_GWEI", "0.05"),
        min_wallet_balance_eth=_dec("ETH_PROBE_MIN_WALLET_BALANCE_ETH", "0.005"),
    )
    return Config(
        execution_rpc_url=_required("EXECUTION_RPC_URL"),
        beacon_api_url=_required("BEACON_API_URL"),
        lighthouse_metrics_url=_required("LIGHTHOUSE_METRICS_URL"),
        database_url=_required("DATABASE_URL"),
        node_name=_str("NODE_NAME", "unknown"),
        network=_str("NETWORK", "mainnet"),
        slot_interval_seconds=_int("SLOT_INTERVAL_SECONDS", 12),
        enable_column_probes=_bool("ENABLE_COLUMN_PROBES", False),
        enable_self_probe_ethereum=_bool("ENABLE_SELF_PROBE_ETHEREUM", False),
        enable_batcher_balances=_bool("ENABLE_BATCHER_BALANCES", False),
        log_level=_str("LOG_LEVEL", "INFO"),
        log_format=_str("LOG_FORMAT", "json"),
        self_probe=self_probe,
        public_execution_rpc_url=_str("PUBLIC_EXECUTION_RPC_URL", ""),
        public_beacon_endpoints=_parse_public_beacons(
            _str("PUBLIC_BEACON_URLS", "")
        ),
    )


def _parse_public_beacons(raw: str) -> Tuple[Tuple[str, str], ...]:
    """Parse comma-separated URLs into (name, url) pairs. Name = hostname
    minus common prefixes (e.g. 'ethereum-beacon-api.publicnode.com' -> 'publicnode')."""
    if not raw.strip():
        return ()
    out = []
    for url in (s.strip() for s in raw.split(",")):
        if not url:
            continue
        # derive a short name from hostname
        host = url.split("//", 1)[-1].split("/", 1)[0]
        # heuristics: pick the recognisable middle token
        if "publicnode" in host:
            name = "publicnode"
        elif "drpc" in host:
            name = "drpc"
        elif "llamarpc" in host:
            name = "llamarpc"
        elif "alchemy" in host:
            name = "alchemy"
        elif "blobscan" in host:
            name = "blobscan"
        else:
            name = host.split(".")[0]
        out.append((name, url))
    return tuple(out)
