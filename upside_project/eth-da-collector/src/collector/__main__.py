from __future__ import annotations

import asyncio
import logging
import signal
from pathlib import Path

from .clients.beacon_api import BeaconAPI
from .clients.execution_rpc import ExecutionRPC
from .clients.lighthouse_metrics import LighthouseMetrics
from .config import load_config
from .db import DB
from .errors import ErrorRecorder
from .logging_setup import setup_logging
from .migrate import run_migrations
from .observers.blob_sidecar import BlobSidecarProbe
from .observers.finality import FinalityObserver
from .observers.gossip_sse import GossipSSEObserver
from .observers.node_health import NodeHealthObserver
from .observers.peers import PeersObserver
from .observers.slot import SlotObserver
from .observers.startup import collect_node_config
from .self_probe.ethereum import EthereumSelfProbe
from .survival.scheduler import SurvivalScheduler
from .survival.worker import SurvivalWorker
from .utils import TickLoop


async def amain() -> None:
    cfg = load_config()
    setup_logging(cfg.log_level, cfg.log_format)
    log = logging.getLogger("main")
    log.info("starting eth-da-collector",
             extra={"node_name": cfg.node_name, "network": cfg.network,
                    "slot_interval_s": cfg.slot_interval_seconds,
                    "self_probe_enabled": cfg.enable_self_probe_ethereum,
                    "self_probe_dry_run": cfg.self_probe.dry_run})

    db = DB(cfg.database_url)
    await db.connect()
    migrations_dir = Path(__file__).resolve().parents[2] / "migrations"
    await run_migrations(db, migrations_dir)

    errors = ErrorRecorder(db)
    beacon = BeaconAPI(cfg.beacon_api_url, errors)
    exec_rpc = ExecutionRPC(cfg.execution_rpc_url, errors)
    metrics = LighthouseMetrics(cfg.lighthouse_metrics_url, errors)

    # Optional public EL fallback (used by self-probe receipt lookup when
    # own EL can't yet serve receipts — e.g. mid-sync).
    public_exec_rpc = (
        ExecutionRPC(cfg.public_execution_rpc_url, errors)
        if cfg.public_execution_rpc_url else None
    )

    # Multi-source beacon clients for blob retrieval. 'local' is required
    # (own LH, primary). Public sources are optional — each adds an
    # independent observer for the network-breadth K/N metric.
    beacons: dict[str, BeaconAPI] = {"local": beacon}
    for name, url in cfg.public_beacon_endpoints:
        if name == "local":
            name = f"local_{len(beacons)}"  # avoid collision
        beacons[name] = BeaconAPI(url, errors)

    # one-shot startup info
    try:
        await collect_node_config(cfg, db, beacon, exec_rpc)
    except Exception:
        log.exception("startup node-config collection failed (continuing)")

    scheduler = SurvivalScheduler(db, cfg.survival_age_buckets)
    sidecar_probe = BlobSidecarProbe(db, beacon, cfg, scheduler)

    health = NodeHealthObserver(db, beacon, exec_rpc, metrics)
    finality = FinalityObserver(db, beacon)
    slot_obs = SlotObserver(db, beacon, exec_rpc, sidecar_probe, errors)
    peers_obs = PeersObserver(db, beacon)

    self_probe = EthereumSelfProbe(
        db, exec_rpc, beacon, cfg.self_probe, cfg.network,
        public_exec_rpc=public_exec_rpc,
        beacons=beacons,
    )

    worker = SurvivalWorker(
        db, beacons,
        self_probe_checker=(self_probe.check_retrieval
                            if cfg.enable_self_probe_ethereum else None),
    )

    loops = [
        TickLoop("slot",          cfg.slot_interval_seconds, slot_obs.tick),
        TickLoop("health",        300.0, health.tick),
        TickLoop("peers",         300.0, peers_obs.tick),
        TickLoop("finality",      384.0, finality.tick),    # ~one epoch
        TickLoop("survival",       60.0, worker.tick),
        # Retry placeholder rows (blob_index=-1) less than 24h old. Cheap:
        # SELECT-bounded query + at most 32 beacon API calls per tick.
        TickLoop("sidecar_retry", 180.0, sidecar_probe.retry_pending),
    ]

    tasks = [asyncio.create_task(l.run(), name=l.name) for l in loops]
    if cfg.enable_self_probe_ethereum:
        tasks.append(asyncio.create_task(self_probe.loop(), name="self_probe"))

    # SSE event stream for real gossip arrival timestamps. Long-lived
    # connection to own LH only — public providers don't expose SSE.
    gossip_sse = GossipSSEObserver(cfg.beacon_api_url, db, errors)
    tasks.append(asyncio.create_task(gossip_sse.run(), name="gossip_sse"))

    stop_event = asyncio.Event()

    def _handle_signal():
        log.info("shutdown signal received")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            pass  # not on this platform

    try:
        await stop_event.wait()
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        for b in beacons.values():
            await b.aclose()
        await exec_rpc.aclose()
        if public_exec_rpc is not None:
            await public_exec_rpc.aclose()
        await metrics.aclose()
        await gossip_sse.aclose()
        await db.close()
        log.info("shutdown complete")


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
