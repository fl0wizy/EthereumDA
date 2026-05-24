-- 0006_kzg_verified.sql
-- KZG commitment+proof verification per sidecar. True/false/null:
--   true  - blob + commitment + proof checked OK
--   false - check failed (malformed sidecar, mismatched commitment)
--   NULL  - not yet checked (placeholder rows, or pre-feature rows)

ALTER TABLE eth_blob_sidecars
    ADD COLUMN IF NOT EXISTS kzg_verified BOOLEAN;

CREATE INDEX IF NOT EXISTS eth_blob_sidecars_kzg_idx
    ON eth_blob_sidecars (kzg_verified)
    WHERE kzg_verified IS NOT NULL;
