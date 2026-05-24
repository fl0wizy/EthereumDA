import { NextRequest, NextResponse } from "next/server";
import { ethDaQuery } from "../../../lib/eth_da_db";

// Pectra (active since 2025-05-07): BLOB_BASE_FEE_UPDATE_FRACTION = 5007716
const BLOB_BASE_FEE_UPDATE_FRACTION = 5007716;

// GET /api/eth-da/security?type=<panel>
// Panel keys:
//   blobs_per_slot (L1) | finality_lag (L2) | blob_basefee (L3) | inclusion (L4)
//   survival_by_age (S1) | survival_latency (S2) | self_probe_e2e (S3) | client_diversity (S4)
//   multi_source_breadth (S5) | kzg_integrity (S6)
//   casper_threshold (C1) | sidecar_propagation (C2) | gossip_arrival (C3) | reorg_timeline (C4)
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "";
  try {
    switch (type) {
      case "blobs_per_slot":
        return NextResponse.json(await blobsPerSlot());
      case "finality_lag":
        return NextResponse.json(await finalityLag());
      case "blob_basefee":
        return NextResponse.json(await blobBasefee());
      case "inclusion":
        return NextResponse.json(await selfProbeInclusion());
      case "survival_by_age":
        return NextResponse.json(await survivalByAge());
      case "survival_latency":
        return NextResponse.json(await survivalLatency());
      case "self_probe_e2e":
        return NextResponse.json(await selfProbeE2E());
      case "client_diversity":
        return NextResponse.json(await clientDiversity());
      case "multi_source_breadth":
        return NextResponse.json(await multiSourceBreadth());
      case "kzg_integrity":
        return NextResponse.json(await kzgIntegrity());
      case "casper_threshold":
        return NextResponse.json(await casperThreshold());
      case "sidecar_propagation":
        return NextResponse.json(await sidecarPropagation());
      case "gossip_arrival":
        return NextResponse.json(await gossipArrival());
      case "reorg_timeline":
        return NextResponse.json(await reorgTimeline());
      default:
        return NextResponse.json(
          { error: "Unknown type", validTypes: [
            "blobs_per_slot", "finality_lag", "blob_basefee", "inclusion",
            "survival_by_age", "survival_latency", "self_probe_e2e",
            "client_diversity", "multi_source_breadth", "kzg_integrity",
            "casper_threshold", "sidecar_propagation", "gossip_arrival",
            "reorg_timeline",
          ] },
          { status: 400 }
        );
    }
  } catch (e) {
    console.error("eth-da/security query error", e);
    return NextResponse.json(
      { error: "query failed", detail: String(e) },
      { status: 500 }
    );
  }
}

// ── L1: blobs per slot (1-min buckets, last 6h) ─────────────────────────
async function blobsPerSlot() {
  const series = await ethDaQuery(`
    SELECT
      date_trunc('minute', timestamp) AS bucket,
      AVG(blob_count)::float        AS avg_blobs,
      MAX(blob_count)               AS max_blobs,
      COUNT(*)                       AS slots
    FROM eth_slots
    WHERE timestamp > NOW() - INTERVAL '6 hours'
    GROUP BY 1 ORDER BY 1
  `);
  const summary = await ethDaQuery(`
    SELECT
      COUNT(*)                                    AS slots,
      COUNT(*) FILTER (WHERE blob_count > 0)      AS slots_with_blobs,
      SUM(blob_count)::bigint                     AS total_blobs,
      ROUND(AVG(blob_count)::numeric, 2)          AS avg_per_slot
    FROM eth_slots
    WHERE timestamp > NOW() - INTERVAL '6 hours'
  `);
  return { series, summary: summary[0], target: 14, cap: 21 }; // post-Fusaka target=14, max=21
}

// ── L2: finality lag (slots between head and last finalized) ────────────
async function finalityLag() {
  const series = await ethDaQuery(`
    WITH h AS (
      SELECT date_trunc('minute', timestamp) AS bucket,
             MAX(head_slot) AS head_slot,
             MAX(timestamp) AS ts
      FROM eth_node_health
      WHERE timestamp > NOW() - INTERVAL '6 hours'
      GROUP BY 1
    )
    SELECT
      h.bucket,
      h.head_slot,
      (SELECT finalized_epoch FROM eth_finality
        WHERE timestamp <= h.ts ORDER BY timestamp DESC LIMIT 1) * 32 AS finalized_slot
    FROM h
    ORDER BY h.bucket
  `);
  const latest = await ethDaQuery(`
    SELECT
      (SELECT head_slot       FROM eth_node_health ORDER BY timestamp DESC LIMIT 1) AS head_slot,
      (SELECT finalized_epoch FROM eth_finality   ORDER BY timestamp DESC LIMIT 1) AS finalized_epoch,
      (SELECT timestamp       FROM eth_finality   ORDER BY timestamp DESC LIMIT 1) AS finalized_at
  `);
  return { series, latest: latest[0] };
}

// ── L3: blob base fee (computed via fake_exponential approximation) ─────
async function blobBasefee() {
  const series = await ethDaQuery(
    `
    SELECT
      date_trunc('minute', timestamp) AS bucket,
      AVG(excess_blob_gas::float8)    AS avg_excess,
      AVG(
        CASE
          WHEN excess_blob_gas::float8 / $1 > 40 THEN NULL
          ELSE EXP(excess_blob_gas::float8 / $1)
        END
      ) AS basefee_wei
    FROM eth_slots
    WHERE timestamp > NOW() - INTERVAL '24 hours'
      AND excess_blob_gas IS NOT NULL
    GROUP BY 1 ORDER BY 1
    `,
    [BLOB_BASE_FEE_UPDATE_FRACTION]
  );
  return { series, update_fraction: BLOB_BASE_FEE_UPDATE_FRACTION };
}

// ── L4: self-probe submit/inclusion latency ─────────────────────────────
async function selfProbeInclusion() {
  const points = await ethDaQuery(`
    SELECT probe_id,
           submit_timestamp,
           submit_latency_ms,
           submit_status,
           submit_cost_wei::text AS submit_cost_wei
    FROM self_probe_ethereum
    WHERE submit_timestamp > NOW() - INTERVAL '30 days'
      AND submit_latency_ms IS NOT NULL
    ORDER BY submit_timestamp
  `);
  const summary = await ethDaQuery(`
    SELECT
      COUNT(*)                                                            AS total,
      COUNT(*) FILTER (WHERE submit_status = 'included')                 AS confirmed,
      COUNT(*) FILTER (WHERE submit_status = 'pending')                   AS pending,
      COUNT(*) FILTER (WHERE submit_status NOT IN ('included','pending')) AS failed,
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY submit_latency_ms)) AS p50_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY submit_latency_ms)) AS p95_ms
    FROM self_probe_ethereum
    WHERE submit_latency_ms IS NOT NULL
  `);
  return { points, summary: summary[0] };
}

// ── S1: survival rate by age bucket ─────────────────────────────────────
async function survivalByAge() {
  const buckets = await ethDaQuery(`
    SELECT
      age_bucket,
      COUNT(*)                                                          AS total,
      COUNT(*) FILTER (WHERE available)                                 AS available,
      ROUND(100.0 * COUNT(*) FILTER (WHERE available)
                       / NULLIF(COUNT(*),0)::numeric, 2)                AS rate_pct,
      ROUND(AVG(latency_ms))                                            AS avg_ms,
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY latency_ms))   AS p50_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))   AS p95_ms
    FROM eth_blob_survival
    GROUP BY age_bucket
    ORDER BY CASE age_bucket
      WHEN 'immediate' THEN 0
      WHEN '10m'       THEN 1
      WHEN '1d'        THEN 2
      WHEN '7d'        THEN 3
      WHEN '17d'       THEN 4
      WHEN '18d'       THEN 5
      WHEN '19d'       THEN 6
      ELSE 99 END
  `);
  return {
    buckets,
    retention_days: 18.2, // MIN_EPOCHS_FOR_BLOB_SIDECARS_REQUESTS = 4096 epochs
  };
}

// ── S2: survival retrieval latency over time, per age bucket ────────────
async function survivalLatency() {
  const series = await ethDaQuery(`
    SELECT
      date_trunc('hour', checked_at)                                    AS bucket,
      age_bucket,
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY latency_ms))   AS p50_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))   AS p95_ms,
      COUNT(*)                                                          AS n
    FROM eth_blob_survival
    WHERE checked_at > NOW() - INTERVAL '48 hours'
      AND latency_ms IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1
  `);
  return { series };
}

// ── S3: self-probe end-to-end retrieval ─────────────────────────────────
async function selfProbeE2E() {
  const summary = await ethDaQuery(`
    SELECT
      COUNT(*)                                                  AS total,
      COUNT(*) FILTER (WHERE submit_status='included')          AS submitted_ok,
      COUNT(*) FILTER (WHERE retrieve_success=true)              AS retrieved,
      COUNT(*) FILTER (WHERE retrieve_success=false)             AS retrieval_failed,
      COUNT(*) FILTER (WHERE submit_status='included'
                       AND retrieve_success IS NULL)             AS retrieval_pending,
      COUNT(*) FILTER (WHERE data_match=true)                    AS data_match_ok,
      COUNT(*) FILTER (WHERE data_match=false)                   AS data_mismatch,
      ROUND(AVG(retrieve_latency_ms)
              FILTER (WHERE retrieve_success=true))              AS avg_retrieve_ms,
      MIN(submit_timestamp)                                      AS first_probe,
      MAX(submit_timestamp)                                      AS last_probe
    FROM self_probe_ethereum
  `);
  const recent = await ethDaQuery(`
    SELECT probe_id,
           submit_timestamp,
           submit_status,
           retrieve_success,
           blob_age_hours,
           retrieve_latency_ms,
           data_match,
           error
    FROM self_probe_ethereum
    ORDER BY submit_timestamp DESC
    LIMIT 25
  `);
  return { summary: summary[0], recent };
}

// ── S4: CL client diversity among connected peers ───────────────────────
async function clientDiversity() {
  const dist = await ethDaQuery(`
    WITH latest AS (
      SELECT DISTINCT ON (peer_id) peer_id, client_kind, state, score
      FROM eth_peer_scores
      WHERE timestamp > NOW() - INTERVAL '2 hours'
      ORDER BY peer_id, timestamp DESC
    )
    SELECT
      COALESCE(NULLIF(client_kind,''),'Unknown') AS client,
      COUNT(*) AS peers,
      ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (),0)::numeric, 2) AS pct
    FROM latest
    GROUP BY 1
    ORDER BY peers DESC
  `);
  return {
    dist,
    safety_threshold_pct: 66.67,  // Casper FFG: >2/3 = supermajority safety risk
  };
}

// ── C1: Casper FFG threshold readout ────────────────────────────────────
async function casperThreshold() {
  const fin = await ethDaQuery(`
    SELECT timestamp, finalized_epoch, current_justified_epoch, previous_justified_epoch
    FROM eth_finality ORDER BY timestamp DESC LIMIT 1
  `);
  const head = await ethDaQuery(`
    SELECT timestamp, head_slot, sync_distance, lighthouse_connected_peers, geth_peer_count
    FROM eth_node_health ORDER BY timestamp DESC LIMIT 1
  `);
  // 384s per epoch normal cadence; growing gap → liveness regression.
  const finalityGap = await ethDaQuery(`
    SELECT
      EXTRACT(EPOCH FROM (NOW() - MAX(timestamp)))::int AS seconds_since_last_finality_update,
      EXTRACT(EPOCH FROM (
        MAX(timestamp) - LAG(MAX(timestamp)) OVER ()
      ))::int AS last_interval_seconds
    FROM eth_finality
    GROUP BY ()
  `);
  return {
    latest_finality: fin[0],
    latest_head: head[0],
    finality_gap: finalityGap[0] ?? null,
    safety_threshold_pct: 33.34,   // ⅓ to break safety (Casper FFG)
    liveness_threshold_pct: 33.34, // ⅓ offline → halt
  };
}

// ── C2: sidecar gossip propagation latency ──────────────────────────────
async function sidecarPropagation() {
  const series = await ethDaQuery(`
    SELECT
      date_trunc('hour', first_seen_at)                                 AS bucket,
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY latency_ms))   AS p50_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms))   AS p95_ms,
      COUNT(*)                                                          AS n
    FROM eth_blob_sidecars
    WHERE first_seen_at > NOW() - INTERVAL '24 hours'
      AND latency_ms IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `);
  return { series, attestation_deadline_ms: 4000 };
}

// ── S5: Multi-source retrieval breadth (K/N) ────────────────────────────
// Tells us how often we can pull the blob from K of N independent CL
// providers. local = own LH, publicnode + drpc = independent public CLs.
// K=N means every provider has it (best case); K=0 means total loss
// (worst case). Distribution across K is the honest breadth metric.
async function multiSourceBreadth() {
  const perSource = await ethDaQuery(`
    SELECT
      source,
      age_bucket,
      COUNT(*)                                                          AS total,
      COUNT(*) FILTER (WHERE available)                                 AS available,
      ROUND(100.0 * COUNT(*) FILTER (WHERE available)
             / NULLIF(COUNT(*),0)::numeric, 2)                          AS rate_pct
    FROM eth_blob_survival
    WHERE checked_at > NOW() - INTERVAL '24 hours'
      AND source IN ('local', 'publicnode', 'drpc')
    GROUP BY 1, 2
    ORDER BY age_bucket, source
  `);
  const kDist = await ethDaQuery(`
    WITH per_blob AS (
      SELECT slot, blob_index, age_bucket,
             COUNT(*)                          AS n,
             COUNT(*) FILTER (WHERE available) AS k
      FROM eth_blob_survival
      WHERE checked_at > NOW() - INTERVAL '24 hours'
        AND source IN ('local', 'publicnode', 'drpc')
      GROUP BY 1, 2, 3
      HAVING COUNT(*) >= 2
    )
    SELECT
      age_bucket,
      COUNT(*) FILTER (WHERE k = 0)              AS k0,
      COUNT(*) FILTER (WHERE k = 1)              AS k1,
      COUNT(*) FILTER (WHERE k = 2)              AS k2,
      COUNT(*) FILTER (WHERE k = 3)              AS k3,
      COUNT(*)                                   AS total
    FROM per_blob
    GROUP BY 1
    ORDER BY CASE age_bucket
      WHEN 'immediate' THEN 0
      WHEN '10m'       THEN 1
      WHEN '1d'        THEN 2
      WHEN '7d'        THEN 3
      WHEN '17d'       THEN 4
      WHEN '18d'       THEN 5
      WHEN '19d'       THEN 6
      ELSE 99 END
  `);
  return { per_source: perSource, k_dist: kDist, n_total: 3 };
}

// ── S6: KZG verification integrity rate ─────────────────────────────────
// Of the blobs where we could run verify_blob_kzg (commitment recompute),
// what fraction passed. False would imply payload corruption or mismatch
// between commitment header and blob bytes — never expected in honest mainnet.
async function kzgIntegrity() {
  const series = await ethDaQuery(`
    SELECT
      date_trunc('hour', first_seen_at)                                    AS bucket,
      COUNT(*) FILTER (WHERE kzg_verified IS TRUE)                         AS verified_true,
      COUNT(*) FILTER (WHERE kzg_verified IS FALSE)                        AS verified_false,
      COUNT(*) FILTER (WHERE kzg_verified IS NOT NULL)                     AS evaluated,
      COUNT(*)                                                             AS total,
      ROUND(100.0 * COUNT(*) FILTER (WHERE kzg_verified IS TRUE)
             / NULLIF(COUNT(*) FILTER (WHERE kzg_verified IS NOT NULL),0)::numeric, 2)
                                                                            AS rate_pct
    FROM eth_blob_sidecars
    WHERE first_seen_at > NOW() - INTERVAL '24 hours'
      AND blob_index >= 0
    GROUP BY 1
    ORDER BY 1
  `);
  const summary = await ethDaQuery(`
    SELECT
      COUNT(*) FILTER (WHERE kzg_verified IS TRUE)                         AS verified_true,
      COUNT(*) FILTER (WHERE kzg_verified IS FALSE)                        AS verified_false,
      COUNT(*) FILTER (WHERE kzg_verified IS NULL)                         AS unverified,
      COUNT(*)                                                             AS total
    FROM eth_blob_sidecars
    WHERE first_seen_at > NOW() - INTERVAL '24 hours'
      AND blob_index >= 0
  `);
  return { series, summary: summary[0] };
}

// ── C3: True gossip arrival latency (data_column_sidecar SSE) ───────────
// gossip_arrival_ts is the ms-precise moment our own LH mesh node received
// a column carrying the blob. Honest measurement of "did the blob make
// the 4s attestation deadline?" — supersedes C2's polling-tick proxy.
//
// Mainnet genesis = 1606824023, SLOT_DURATION = 12s.
async function gossipArrival() {
  const series = await ethDaQuery(`
    SELECT
      date_trunc('hour', gossip_arrival_ts)                                AS bucket,
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY
        EXTRACT(EPOCH FROM (gossip_arrival_ts - to_timestamp(1606824023 + slot * 12))) * 1000
      ))                                                                    AS p50_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY
        EXTRACT(EPOCH FROM (gossip_arrival_ts - to_timestamp(1606824023 + slot * 12))) * 1000
      ))                                                                    AS p95_ms,
      COUNT(*)                                                              AS n
    FROM eth_blob_sidecars
    WHERE gossip_arrival_ts > NOW() - INTERVAL '24 hours'
      AND blob_index >= 0
    GROUP BY 1
    ORDER BY 1
  `);
  const summary = await ethDaQuery(`
    SELECT
      COUNT(*)                                                              AS n,
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY
        EXTRACT(EPOCH FROM (gossip_arrival_ts - to_timestamp(1606824023 + slot * 12))) * 1000
      ))                                                                    AS p50_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY
        EXTRACT(EPOCH FROM (gossip_arrival_ts - to_timestamp(1606824023 + slot * 12))) * 1000
      ))                                                                    AS p95_ms,
      COUNT(*) FILTER (WHERE
        EXTRACT(EPOCH FROM (gossip_arrival_ts - to_timestamp(1606824023 + slot * 12))) * 1000
        > 4000
      )                                                                     AS over_deadline
    FROM eth_blob_sidecars
    WHERE gossip_arrival_ts > NOW() - INTERVAL '24 hours'
      AND blob_index >= 0
  `);
  return { series, summary: summary[0], attestation_deadline_ms: 4000 };
}

// ── C4: Chain reorg timeline ────────────────────────────────────────────
// Each row is a chain_reorg SSE event from own LH. depth = how many slots
// were rolled back; affected_blob_count = sidecars in those slots that the
// reorg invalidated. Sustained reorgs are a liveness *and* safety signal.
async function reorgTimeline() {
  const events = await ethDaQuery(`
    SELECT timestamp, slot, depth, epoch, affected_blob_count,
           old_head_block, new_head_block
    FROM eth_reorgs
    WHERE timestamp > NOW() - INTERVAL '30 days'
    ORDER BY timestamp DESC
    LIMIT 200
  `);
  const summary = await ethDaQuery(`
    SELECT
      COUNT(*)                                          AS total_7d,
      COUNT(*) FILTER (WHERE depth >= 2)                AS deep_7d,
      SUM(affected_blob_count)::int                     AS affected_blobs_7d,
      MAX(depth)                                        AS max_depth_7d,
      MAX(timestamp)                                    AS latest
    FROM eth_reorgs
    WHERE timestamp > NOW() - INTERVAL '7 days'
  `);
  return { events, summary: summary[0] };
}
