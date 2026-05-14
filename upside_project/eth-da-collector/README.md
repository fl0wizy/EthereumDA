# eth-da-collector

A small, durable Ethereum data-availability liveness collector. Runs on a GCP VM,
talks to a self-hosted Geth + Lighthouse node, and writes metadata to PostgreSQL.

MVP scope: observation only. Self-probe (type-3 blob tx submission) is scaffolded
but disabled by default and gated on multiple feature flags and spend caps.

## Layout

```
migrations/           numbered .sql files applied in order
sql/queries.sql       canned operator queries
src/collector/
  config.py           env -> typed config
  db.py               asyncpg pool
  migrate.py          file-based migration runner
  errors.py           error recorder (writes eth_observation_errors)
  logging_setup.py    JSON logs, redacts known secret keys
  utils.py            backoff, slot/epoch helpers
  clients/            execution_rpc, beacon_api, lighthouse_metrics
  observers/          startup, node_health, finality, slot+execution+blob_sidecar
  survival/           scheduler + worker for 1/7/17/18/19d checks
  self_probe/         disabled-by-default Ethereum blob self-probe
systemd/              service unit
Dockerfile, docker-compose.yml
```

## Quick start (SSH tunnel + venv)

On the GCP VM:

```bash
# 1. Open the tunnel to the Hetzner node (keep this running).
ssh -N \
  -L 8545:127.0.0.1:8545 \
  -L 5052:127.0.0.1:5052 \
  -L 5054:127.0.0.1:5054 \
  fl0wizy@<hetzner-host>

# 2. Postgres
sudo apt-get install -y postgresql
sudo -u postgres psql -c "CREATE USER collector WITH PASSWORD 'collector';"
sudo -u postgres psql -c "CREATE DATABASE eth_da OWNER collector;"

# 3. Python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Config
cp .env.example .env
# edit .env if needed

# 5. Run (migrations are applied on startup)
PYTHONPATH=src python -m collector
```

## Docker Compose

```bash
cp .env.example .env
docker compose up -d
docker compose logs -f collector
```

The compose file binds Postgres to 127.0.0.1 only. To reach an SSH tunnel
on the host from inside the collector container, set `network_mode: host`
on the `collector` service or use Tailscale/WireGuard in production.

## systemd

```bash
sudo useradd --system --home /opt/eth-da-collector --shell /usr/sbin/nologin collector
sudo mkdir -p /opt/eth-da-collector /etc/eth-da-collector /var/log/eth-da-collector
sudo rsync -a ./ /opt/eth-da-collector/
sudo python3 -m venv /opt/eth-da-collector/.venv
sudo /opt/eth-da-collector/.venv/bin/pip install -r /opt/eth-da-collector/requirements.txt
sudo cp .env.example /etc/eth-da-collector/.env  # then edit
sudo chown -R collector:collector /opt/eth-da-collector /etc/eth-da-collector /var/log/eth-da-collector
sudo chmod 600 /etc/eth-da-collector/.env
sudo install -m 644 systemd/eth-da-collector.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eth-da-collector
journalctl -u eth-da-collector -f
```

## Cadence

- Every `SLOT_INTERVAL_SECONDS` (default 12 s): head slot -> beacon block ->
  execution block -> type-3 txs -> blob_sidecars if any -> schedule survival probes.
- Every 5 min: node syncing, peer count, peer summary; tick survival worker.
- Every epoch (~6.4 min): finality checkpoints.
- Startup once: config spec, node identity, Lighthouse custody info, client versions.

## Survival schedule

For each observed blob, probe at age 1 d, 7 d, 17 d, 18 d, 19 d. Stored in
`eth_blob_survival`.

## Self-probe (off in MVP)

The Ethereum self-probe module is fully scaffolded but will refuse to send a
transaction unless **all** of these hold:

- `ENABLE_SELF_PROBE_ETHEREUM=true`
- `ETH_PROBE_DRY_RUN=false`
- `ETH_PROBE_PRIVATE_KEY` is set
- `ETH_PROBE_FROM_ADDRESS` matches the key
- wallet balance >= `ETH_PROBE_MIN_WALLET_BALANCE_ETH`
- total + daily spend caps not exceeded
- `maxFeePerGas`, `maxPriorityFeePerGas`, `maxFeePerBlobGas` all under caps

Otherwise it logs the reason and writes a dry-run row.

Private keys are never logged, printed, or stored in DB. `ETH_PROBE_PRIVATE_KEY`
is read once and held in memory only.

## Operator queries

See `sql/queries.sql`.

## Extension points (intentionally not implemented in MVP)

- `eth_column_probes` (PeerDAS): hook in `observers/blob_sidecar.py` after a
  Lighthouse `data_column_sidecars` probe is validated. Move to ClickHouse if
  per-slot column volume gets heavy.
- Other DA networks (EigenDA, Celestia, Avail): add `clients/<net>.py` and a
  parallel observer; keep `eth_*` table prefixes.
- L2 attribution: populate `l2_addressbook` and join on `eth_blob_txs.sender`.
- Batcher balances: separate loop gated by `ENABLE_BATCHER_BALANCES`.
