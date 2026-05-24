-- 0004_blob_survival_source.sql
-- Multi-source retrieval: every survival check fans out to N beacon
-- endpoints (own LH + publicnode + drpc + ...). Each source's answer is
-- stored as a separate row so "K out of N sources retrievable" can be
-- computed downstream (network breadth metric).
--
-- For self-probe retrievals we use source names like 'self_probe:local',
-- 'self_probe:publicnode' to keep them in the same table.

ALTER TABLE eth_blob_survival
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'local';

-- Replace the old (slot, blob_index, age_bucket) uniqueness with a
-- 4-tuple including source. Old rows get DEFAULT 'local' so they are
-- preserved as the single-source measurement.
ALTER TABLE eth_blob_survival
    DROP CONSTRAINT IF EXISTS eth_blob_survival_slot_blob_index_age_bucket_key;

ALTER TABLE eth_blob_survival
    ADD CONSTRAINT eth_blob_survival_uniq
    UNIQUE (slot, blob_index, age_bucket, source);

CREATE INDEX IF NOT EXISTS eth_blob_survival_source_idx
    ON eth_blob_survival (source, checked_at DESC);
