-- Canned operator queries. Use with `psql -f sql/queries.sql` to print all
-- or copy individual blocks. Each block is self-contained.

-- ============================================================
-- Node health: last 24 h
-- ============================================================
SELECT timestamp,
       is_syncing,
       is_optimistic,
       el_offline,
       head_slot,
       sync_distance,
       geth_peer_count,
       lighthouse_connected_peers
  FROM eth_node_health
 WHERE timestamp > now() - INTERVAL '24 hours'
 ORDER BY timestamp DESC;

-- Peer counts: last 24 h
SELECT timestamp, connected, connecting, disconnected, disconnecting
  FROM eth_peers
 WHERE timestamp > now() - INTERVAL '24 hours'
 ORDER BY timestamp DESC;

-- ============================================================
-- Latest slots (newest 100)
-- ============================================================
SELECT slot, epoch, proposer_index, blob_count,
       execution_block_number, base_fee_per_gas,
       blob_gas_used, excess_blob_gas, observed_at
  FROM eth_slots
 ORDER BY slot DESC
 LIMIT 100;

-- ============================================================
-- Blob count and gas usage over time (1-h buckets, last 7 d)
-- ============================================================
SELECT date_trunc('hour', timestamp) AS hour,
       count(*)              AS slots,
       sum(blob_count)       AS blobs,
       avg(blob_gas_used)    AS avg_blob_gas_used,
       avg(base_fee_per_gas) AS avg_base_fee
  FROM eth_slots
 WHERE timestamp > now() - INTERVAL '7 days'
 GROUP BY hour
 ORDER BY hour DESC;

-- ============================================================
-- Blob sidecar availability — most recent 1 000 sidecars
-- ============================================================
SELECT slot, blob_index, available, latency_ms, error,
       matched_tx_hash IS NOT NULL AS matched
  FROM eth_blob_sidecars
 ORDER BY first_seen_at DESC
 LIMIT 1000;

-- Availability rate over time (1-h buckets)
SELECT date_trunc('hour', first_seen_at) AS hour,
       count(*)                                AS total,
       count(*) FILTER (WHERE available)       AS available,
       round(100.0 * count(*) FILTER (WHERE available) / NULLIF(count(*),0), 2) AS pct
  FROM eth_blob_sidecars
 WHERE first_seen_at > now() - INTERVAL '7 days'
 GROUP BY hour
 ORDER BY hour DESC;

-- ============================================================
-- Survival check results
-- ============================================================
SELECT age_bucket,
       count(*)                                  AS checks,
       count(*) FILTER (WHERE available)         AS available,
       round(100.0 * count(*) FILTER (WHERE available) / NULLIF(count(*),0), 2) AS pct,
       avg(latency_ms)                           AS avg_latency_ms
  FROM eth_blob_survival
 WHERE checked_at > now() - INTERVAL '30 days'
 GROUP BY age_bucket
 ORDER BY age_bucket;

-- Survival timeline (per-bucket counts over time)
SELECT date_trunc('day', checked_at) AS day, age_bucket,
       count(*) FILTER (WHERE available) AS ok,
       count(*) FILTER (WHERE NOT available) AS miss
  FROM eth_blob_survival
 WHERE checked_at > now() - INTERVAL '30 days'
 GROUP BY day, age_bucket
 ORDER BY day DESC, age_bucket;

-- ============================================================
-- Self-probe status
-- ============================================================
SELECT submit_status, count(*),
       sum(submit_cost_wei)::numeric / 1e18 AS total_eth
  FROM self_probe_ethereum
 GROUP BY submit_status
 ORDER BY count(*) DESC;

SELECT probe_id, submit_timestamp, submit_status, tx_hash,
       retrieve_success, data_match, blob_age_hours
  FROM self_probe_ethereum
 ORDER BY submit_timestamp DESC
 LIMIT 100;

-- 24-h spend
SELECT coalesce(sum(submit_cost_wei),0)::numeric / 1e18 AS eth_spent_24h
  FROM self_probe_ethereum
 WHERE submit_timestamp > now() - INTERVAL '24 hours'
   AND submit_status NOT IN ('dry_run','refused');

-- ============================================================
-- Errors
-- ============================================================
SELECT source, error_type, count(*) AS n, max(timestamp) AS last_seen
  FROM eth_observation_errors
 WHERE timestamp > now() - INTERVAL '24 hours'
 GROUP BY source, error_type
 ORDER BY n DESC;

SELECT timestamp, source, endpoint, slot, error_type, http_status, message
  FROM eth_observation_errors
 ORDER BY id DESC
 LIMIT 200;

-- ============================================================
-- Probe schedule backlog
-- ============================================================
SELECT status, count(*) FROM probe_schedule GROUP BY status;

SELECT id, target_type, target_id, slot, age_bucket, due_at, attempt_count, last_error
  FROM probe_schedule
 WHERE status IN ('pending','running')
 ORDER BY due_at
 LIMIT 100;
