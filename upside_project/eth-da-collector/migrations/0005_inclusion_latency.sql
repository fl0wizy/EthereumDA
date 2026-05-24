-- 0005_inclusion_latency.sql
-- self_probe submit_latency_ms is the RPC pipeline latency (submit_one
-- start -> sendRawTransaction return), NOT inclusion latency. Add a
-- separate column for the real broadcast -> inclusion delay so the L4
-- dashboard panel can be re-pointed honestly.

ALTER TABLE self_probe_ethereum
    ADD COLUMN IF NOT EXISTS inclusion_latency_ms INTEGER;

CREATE INDEX IF NOT EXISTS self_probe_ethereum_inclusion_lat_idx
    ON self_probe_ethereum (inclusion_latency_ms)
    WHERE inclusion_latency_ms IS NOT NULL;
