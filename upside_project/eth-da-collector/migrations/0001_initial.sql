-- 0001_initial.sql
-- Ethereum DA liveness collector — initial schema.
-- Conventions:
--   * wei amounts: NUMERIC(78,0). uint256-safe.
--   * slot / epoch / block_number: BIGINT.
--   * timestamps: TIMESTAMPTZ.
--   * inserts are idempotent via PK or unique constraints + ON CONFLICT.

CREATE TABLE IF NOT EXISTS eth_node_config (
    id                BIGSERIAL PRIMARY KEY,
    node_name         TEXT        NOT NULL,
    chain_id          BIGINT,
    client_versions   JSONB,
    custody_columns   JSONB,
    spec_params       JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eth_node_config_created_at_idx
    ON eth_node_config (created_at DESC);

CREATE TABLE IF NOT EXISTS eth_node_health (
    timestamp                   TIMESTAMPTZ NOT NULL,
    is_syncing                  BOOLEAN,
    is_optimistic               BOOLEAN,
    el_offline                  BOOLEAN,
    head_slot                   BIGINT,
    sync_distance               BIGINT,
    execution_syncing           JSONB,
    geth_peer_count             INTEGER,
    lighthouse_connected_peers  INTEGER,
    PRIMARY KEY (timestamp)
);
CREATE INDEX IF NOT EXISTS eth_node_health_ts_idx
    ON eth_node_health (timestamp DESC);

CREATE TABLE IF NOT EXISTS eth_peers (
    timestamp       TIMESTAMPTZ NOT NULL PRIMARY KEY,
    connected       INTEGER,
    connecting      INTEGER,
    disconnected    INTEGER,
    disconnecting   INTEGER,
    peer_summary    JSONB
);

CREATE TABLE IF NOT EXISTS eth_finality (
    timestamp                 TIMESTAMPTZ NOT NULL PRIMARY KEY,
    previous_justified_epoch  BIGINT,
    current_justified_epoch   BIGINT,
    finalized_epoch           BIGINT,
    finalized_root            TEXT
);

CREATE TABLE IF NOT EXISTS eth_slots (
    slot                    BIGINT      PRIMARY KEY,
    epoch                   BIGINT,
    proposer_index          BIGINT,
    block_root              TEXT,
    execution_block_number  BIGINT,
    execution_block_hash    TEXT,
    timestamp               TIMESTAMPTZ,
    blob_count              INTEGER     NOT NULL DEFAULT 0,
    blob_gas_used           NUMERIC(78,0),
    excess_blob_gas         NUMERIC(78,0),
    base_fee_per_gas        NUMERIC(78,0),
    observed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    node_is_syncing         BOOLEAN,
    node_is_optimistic      BOOLEAN
);
CREATE INDEX IF NOT EXISTS eth_slots_block_number_idx
    ON eth_slots (execution_block_number);
CREATE INDEX IF NOT EXISTS eth_slots_timestamp_idx
    ON eth_slots (timestamp DESC);

CREATE TABLE IF NOT EXISTS eth_blob_txs (
    tx_hash                  TEXT        PRIMARY KEY,
    slot                     BIGINT,
    block_number             BIGINT,
    tx_index                 INTEGER,
    sender                   TEXT,
    recipient                TEXT,
    blob_count               INTEGER,
    blob_versioned_hashes    JSONB,
    max_fee_per_blob_gas     NUMERIC(78,0),
    status                   INTEGER,
    blob_gas_used            NUMERIC(78,0),
    blob_gas_price           NUMERIC(78,0),
    rollup_name              TEXT
);
CREATE INDEX IF NOT EXISTS eth_blob_txs_slot_idx       ON eth_blob_txs (slot);
CREATE INDEX IF NOT EXISTS eth_blob_txs_sender_idx     ON eth_blob_txs (sender);
CREATE INDEX IF NOT EXISTS eth_blob_txs_block_idx      ON eth_blob_txs (block_number);

CREATE TABLE IF NOT EXISTS eth_blob_sidecars (
    slot              BIGINT      NOT NULL,
    blob_index        INTEGER     NOT NULL,
    kzg_commitment    TEXT        NOT NULL,
    versioned_hash    TEXT,
    first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    latency_ms        INTEGER,
    available         BOOLEAN     NOT NULL,
    matched_tx_hash   TEXT,
    error             TEXT,
    PRIMARY KEY (slot, blob_index)
);
CREATE INDEX IF NOT EXISTS eth_blob_sidecars_first_seen_idx
    ON eth_blob_sidecars (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS eth_blob_sidecars_versioned_hash_idx
    ON eth_blob_sidecars (versioned_hash);

CREATE TABLE IF NOT EXISTS eth_blob_survival (
    id              BIGSERIAL   PRIMARY KEY,
    slot            BIGINT      NOT NULL,
    blob_index      INTEGER,
    age_bucket      TEXT        NOT NULL,  -- e.g. '1d','7d','17d','18d','19d'
    age_hours       INTEGER,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    available       BOOLEAN     NOT NULL,
    reconstructable BOOLEAN,
    latency_ms      INTEGER,
    error_type      TEXT,
    http_status     INTEGER,
    UNIQUE (slot, blob_index, age_bucket)
);
CREATE INDEX IF NOT EXISTS eth_blob_survival_slot_idx
    ON eth_blob_survival (slot);
CREATE INDEX IF NOT EXISTS eth_blob_survival_checked_at_idx
    ON eth_blob_survival (checked_at DESC);

CREATE TABLE IF NOT EXISTS probe_schedule (
    id            BIGSERIAL    PRIMARY KEY,
    target_type   TEXT         NOT NULL,   -- 'blob_sidecar' | 'self_probe'
    target_id     TEXT         NOT NULL,   -- composite key as text, e.g. '<slot>:<blob_index>' or probe_id
    slot          BIGINT,
    blob_index    INTEGER,
    due_at        TIMESTAMPTZ  NOT NULL,
    age_bucket    TEXT         NOT NULL,
    status        TEXT         NOT NULL DEFAULT 'pending', -- pending|running|done|failed|cancelled
    attempt_count INTEGER      NOT NULL DEFAULT 0,
    last_error    TEXT,
    UNIQUE (target_type, target_id, age_bucket)
);
CREATE INDEX IF NOT EXISTS probe_schedule_due_idx
    ON probe_schedule (status, due_at);

CREATE TABLE IF NOT EXISTS eth_observation_errors (
    id            BIGSERIAL    PRIMARY KEY,
    timestamp     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    source        TEXT         NOT NULL,  -- module name
    endpoint      TEXT,
    slot          BIGINT,
    column_index  INTEGER,
    error_type    TEXT         NOT NULL,
    http_status   INTEGER,
    latency_ms    INTEGER,
    message       TEXT
);
CREATE INDEX IF NOT EXISTS eth_observation_errors_ts_idx
    ON eth_observation_errors (timestamp DESC);
CREATE INDEX IF NOT EXISTS eth_observation_errors_source_idx
    ON eth_observation_errors (source, timestamp DESC);

CREATE TABLE IF NOT EXISTS l2_addressbook (
    address      TEXT          PRIMARY KEY,
    rollup_name  TEXT          NOT NULL,
    role         TEXT,
    source       TEXT,
    confidence   TEXT,
    active_from  TIMESTAMPTZ,
    active_to    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS self_probe_ethereum (
    probe_id              TEXT         PRIMARY KEY,
    payload_hash          TEXT         NOT NULL,
    payload_size_bytes    INTEGER,
    submit_timestamp      TIMESTAMPTZ,
    submit_latency_ms     INTEGER,
    submit_identifier     TEXT,
    tx_hash               TEXT,
    from_address          TEXT,
    to_address            TEXT,
    submit_cost_wei       NUMERIC(78,0),
    submit_status         TEXT,         -- 'dry_run'|'pending'|'included'|'failed'|'refused'
    max_fee_per_gas       NUMERIC(78,0),
    max_fee_per_blob_gas  NUMERIC(78,0),
    blob_versioned_hashes JSONB,
    retrieve_timestamp    TIMESTAMPTZ,
    retrieve_latency_ms   INTEGER,
    retrieve_success      BOOLEAN,
    retrieve_data_hash    TEXT,
    data_match            BOOLEAN,
    blob_age_hours        INTEGER,
    error                 TEXT
);
CREATE INDEX IF NOT EXISTS self_probe_ethereum_submit_ts_idx
    ON self_probe_ethereum (submit_timestamp DESC);
CREATE INDEX IF NOT EXISTS self_probe_ethereum_tx_hash_idx
    ON self_probe_ethereum (tx_hash);
