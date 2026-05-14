-- 0002_peer_scores.sql
-- Per-peer score time series. Lets us detect:
--   * peers losing reputation in our Lighthouse (misbehavior detection)
--   * client diversity (agent_version distribution)
--   * peer churn rate
--   * Sybil-like patterns (multiple peer_ids from one IP/AS)

CREATE TABLE IF NOT EXISTS eth_peer_scores (
    timestamp     TIMESTAMPTZ      NOT NULL,
    peer_id       TEXT             NOT NULL,
    agent_version TEXT,
    client_kind   TEXT,           -- 'Lighthouse','Prysm','Teku','Nimbus','Lodestar',...
    score         DOUBLE PRECISION,
    state         TEXT,           -- 'connected'|'disconnected'|...
    direction     TEXT,           -- 'inbound'|'outbound'
    enr_ip        TEXT,
    PRIMARY KEY (timestamp, peer_id)
);

CREATE INDEX IF NOT EXISTS eth_peer_scores_peer_id_idx
    ON eth_peer_scores (peer_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS eth_peer_scores_ts_idx
    ON eth_peer_scores (timestamp DESC);
CREATE INDEX IF NOT EXISTS eth_peer_scores_client_idx
    ON eth_peer_scores (client_kind, timestamp DESC);
