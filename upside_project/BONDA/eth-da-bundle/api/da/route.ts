import { NextRequest, NextResponse } from "next/server";
import { query } from "../../lib/db";

// DB 연결 여부 확인
function isDbConfigured(): boolean {
  return !!(process.env.DATABASE_URL || process.env.DB_HOST);
}

// GET /api/da?type=overview|survival|latency|spec|incidents|health
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "overview";

  // DB 미설정 시 mock 데이터 반환
  if (!isDbConfigured()) {
    return NextResponse.json(
      { source: "mock", message: "DB not configured. Set DATABASE_URL or DB_HOST in .env.local" },
      { status: 200 }
    );
  }

  try {
    switch (type) {
      case "overview":
        return NextResponse.json(await getOverview());
      case "survival":
        return NextResponse.json(await getSurvivalCurve());
      case "latency":
        return NextResponse.json(await getLatencyTimeseries());
      case "health":
        return NextResponse.json(await getNodeHealth());
      case "incidents":
        return NextResponse.json(await getIncidents());
      case "namespaces":
        return NextResponse.json(await getNamespaceUsage());
      default:
        return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    }
  } catch (error) {
    console.error("DB query error:", error);
    return NextResponse.json(
      { error: "Database query failed", detail: String(error) },
      { status: 500 }
    );
  }
}

// ─── 쿼리 함수들 ──────────────────────────────────────

async function getOverview() {
  // 각 DA별 최신 node_health + probe 통계
  const health = await query(`
    SELECT DISTINCT ON (da_layer)
      da_layer, network_head, local_head, sync_lag, is_syncing,
      peers_count, rpc_latency_ms, rpc_success, das_running,
      block_confidence, ts
    FROM node_health
    ORDER BY da_layer, ts DESC
  `);

  // 최근 24h submit 성공률
  const submitStats = await query(`
    SELECT
      da_layer,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE submit_success) AS success,
      ROUND(AVG(submit_latency_ms)) AS avg_latency_ms,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY submit_latency_ms) AS p50_latency,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY submit_latency_ms) AS p95_latency
    FROM probes
    WHERE ts > NOW() - INTERVAL '24 hours'
    GROUP BY da_layer
  `);

  // 최근 24h retrieval 성공률
  const retrievalStats = await query(`
    SELECT
      da_layer,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE fetch_success) AS success,
      ROUND(100.0 * COUNT(*) FILTER (WHERE fetch_success) / NULLIF(COUNT(*), 0), 1) AS success_rate
    FROM retrievals
    WHERE ts > NOW() - INTERVAL '24 hours'
    GROUP BY da_layer
  `);

  return { health, submitStats, retrievalStats };
}

async function getSurvivalCurve() {
  // 각 DA, 각 bucket별 retrieval 성공률
  const curve = await query(`
    SELECT
      da_layer,
      bucket_label,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE fetch_success) AS success,
      ROUND(100.0 * COUNT(*) FILTER (WHERE fetch_success) / NULLIF(COUNT(*), 0), 1) AS success_rate,
      ROUND(AVG(fetch_latency_ms)) AS avg_latency_ms
    FROM retrievals
    WHERE ts > NOW() - INTERVAL '30 days'
    GROUP BY da_layer, bucket_label
    ORDER BY da_layer,
      CASE bucket_label
        WHEN '5m' THEN 1 WHEN '15m' THEN 2 WHEN '1h' THEN 3
        WHEN '6h' THEN 4 WHEN '1d' THEN 5 WHEN '3d' THEN 6
        WHEN '7d' THEN 7 WHEN '14d' THEN 8 WHEN '30d' THEN 9
      END
  `);

  return { curve };
}

async function getLatencyTimeseries() {
  // 최근 24h, 1시간 단위 submit latency
  const latency = await query(`
    SELECT
      da_layer,
      time_bucket('1 hour', ts) AS bucket_time,
      ROUND(AVG(submit_latency_ms)) AS avg_ms,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY submit_latency_ms)) AS p50_ms,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY submit_latency_ms)) AS p95_ms,
      COUNT(*) AS count
    FROM probes
    WHERE ts > NOW() - INTERVAL '24 hours' AND submit_success = true
    GROUP BY da_layer, bucket_time
    ORDER BY bucket_time
  `);

  return { latency };
}

async function getNodeHealth() {
  // 최근 6h node_health 시계열
  const health = await query(`
    SELECT
      da_layer,
      time_bucket('5 minutes', ts) AS bucket_time,
      AVG(sync_lag) AS avg_sync_lag,
      AVG(peers_count) AS avg_peers,
      AVG(rpc_latency_ms) AS avg_rpc_latency,
      BOOL_AND(rpc_success) AS all_rpc_success
    FROM node_health
    WHERE ts > NOW() - INTERVAL '6 hours'
    GROUP BY da_layer, bucket_time
    ORDER BY bucket_time
  `);

  return { health };
}

async function getIncidents() {
  // probe/retrieval 실패 이벤트를 incidents로 조합
  const submitFailures = await query(`
    SELECT
      da_layer, ts, 'submit_failure' AS type,
      error_type, submit_latency_ms,
      details
    FROM probes
    WHERE submit_success = false AND ts > NOW() - INTERVAL '7 days'
    ORDER BY ts DESC
    LIMIT 50
  `);

  const retrievalFailures = await query(`
    SELECT
      r.da_layer, r.ts, 'retrieval_failure' AS type,
      r.error_type, r.bucket_label, r.fetch_latency_ms
    FROM retrievals r
    WHERE r.fetch_success = false AND r.ts > NOW() - INTERVAL '7 days'
    ORDER BY r.ts DESC
    LIMIT 50
  `);

  return { submitFailures, retrievalFailures };
}

async function getNamespaceUsage() {
  // 최근 24h namespace 활동
  const usage = await query(`
    SELECT
      da_layer, namespace_or_appid,
      mn.rollup_name,
      SUM(blob_count) AS total_blobs,
      SUM(total_bytes) AS total_bytes,
      ROUND(AVG(fetch_latency_ms)) AS avg_fetch_latency,
      ROUND(100.0 * COUNT(*) FILTER (WHERE fetch_success) / NULLIF(COUNT(*), 0), 1) AS fetch_success_rate
    FROM namespace_observations no2
    LEFT JOIN monitored_namespaces mn USING (da_layer, namespace_or_appid)
    WHERE no2.ts > NOW() - INTERVAL '24 hours'
    GROUP BY da_layer, namespace_or_appid, mn.rollup_name
    ORDER BY total_bytes DESC
  `);

  return { usage };
}
