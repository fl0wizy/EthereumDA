-- 0003_self_probe_cost_breakdown.sql
-- Break out the components that make up self_probe_ethereum.submit_cost_wei
-- so we can analyze execution-gas vs blob-gas spend separately. All new
-- columns are NULLABLE so existing rows are preserved.

ALTER TABLE self_probe_ethereum
    ADD COLUMN IF NOT EXISTS gas_used            BIGINT,
    ADD COLUMN IF NOT EXISTS effective_gas_price NUMERIC(78,0),
    ADD COLUMN IF NOT EXISTS blob_gas_used       BIGINT,
    ADD COLUMN IF NOT EXISTS blob_gas_price      NUMERIC(78,0);
