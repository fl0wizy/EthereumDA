-- 0007_gossip_arrival.sql
-- True gossip arrival timestamp from own LH SSE event stream
-- (/eth/v1/events?topics=blob_sidecar). This is the actual moment our
-- mesh node received the sidecar via libp2p gossip — distinct from
-- `first_seen_at` which is when our polling tick INSERTed the row.
--
-- The C2 dashboard panel should be re-pointed to this column to make
-- 4-second attestation-deadline comparisons honest.

ALTER TABLE eth_blob_sidecars
    ADD COLUMN IF NOT EXISTS gossip_arrival_ts TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS eth_blob_sidecars_gossip_arrival_idx
    ON eth_blob_sidecars (gossip_arrival_ts DESC)
    WHERE gossip_arrival_ts IS NOT NULL;

-- Reorgs observed via /eth/v1/events?topics=chain_reorg.
-- Each event documents the depth and old vs new head, plus a count of
-- blob sidecars that were in the reorged-out portion (computed at
-- ingest time by joining eth_blob_sidecars on slots affected).
CREATE TABLE IF NOT EXISTS eth_reorgs (
    timestamp           TIMESTAMPTZ NOT NULL,
    depth               INTEGER,
    slot                BIGINT,
    old_head_block      TEXT,
    new_head_block      TEXT,
    old_head_state      TEXT,
    new_head_state      TEXT,
    epoch               BIGINT,
    affected_blob_count INTEGER,
    PRIMARY KEY (timestamp, slot)
);

CREATE INDEX IF NOT EXISTS eth_reorgs_slot_idx
    ON eth_reorgs (slot DESC);
