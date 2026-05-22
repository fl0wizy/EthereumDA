"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Legend,
  Cell,
} from "recharts";
import {
  Card, ErrBox, Loading, StatTile, colors, tooltipStyle, useApi, fmtMs,
} from "./shared";

// ─── S1: Blob survival rate by age bucket ─────────────────────────────
type SurvivalByAge = {
  buckets: Array<{
    age_bucket: string; total: number; available: number;
    rate_pct: string | number; avg_ms: number;
    p50_ms: number; p95_ms: number;
  }>;
  retention_days: number;
};
export function S1_SurvivalByAge() {
  const { data, err, loading } = useApi<SurvivalByAge>("survival_by_age");
  if (err) return <Card title="S1 · Survival by Age Bucket"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="S1 · Survival by Age Bucket"><Loading /></Card>;
  const rows = data.buckets.map((b) => ({
    bucket: b.age_bucket,
    rate: Number(b.rate_pct),
    total: b.total,
    p95_ms: b.p95_ms,
  }));
  return (
    <Card
      wide
      title="S1 · Blob Survival Rate by Age Bucket"
      subtitle={`퍼블릭 블롭의 age bucket 별 retrieval 성공률. 스펙상 retention = ${data.retention_days}일 (MIN_EPOCHS_FOR_BLOB_SIDECARS_REQUESTS = 4096). 18d 이내에서 100% 가 아니면 safety 사고.`}
    >
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="bucket" stroke={colors.axis} fontSize={13} />
            <YAxis
              domain={[0, 100]} stroke={colors.axis} fontSize={13}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={((v: unknown, _n: unknown, item: unknown) => {
                const num = typeof v === "number" ? v : Number(v);
                const total = (item as { payload?: { total?: number } } | undefined)?.payload?.total ?? 0;
                return [`${num.toFixed(2)}% (${total} probes)`, "available"];
              }) as never}
            />
            <ReferenceLine y={100} stroke={colors.green} strokeDasharray="4 4" />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {rows.map((r, i) => (
                <Cell
                  key={i}
                  fill={r.rate >= 99.5 ? colors.green : r.rate >= 95 ? colors.yellow : colors.red}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
        {data.buckets.map((b) => (
          <div key={b.age_bucket} className="border border-card-border rounded p-3 text-xs">
            <div className="text-muted uppercase tracking-wider">{b.age_bucket}</div>
            <div className="text-xl font-mono font-bold mt-1">{Number(b.rate_pct).toFixed(2)}%</div>
            <div className="text-muted mt-1">
              {b.total} probes · p95 {fmtMs(b.p95_ms)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── S2: Retrieval latency per age bucket over 48h ─────────────────────
type SurvivalLatency = {
  series: Array<{
    bucket: string; age_bucket: string;
    p50_ms: number; p95_ms: number; n: number;
  }>;
};
export function S2_SurvivalLatency() {
  const { data, err, loading } = useApi<SurvivalLatency>("survival_latency");
  if (err) return <Card title="S2 · Retrieval Latency"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="S2 · Retrieval Latency"><Loading /></Card>;
  // Pivot: bucket time -> { '1d_p95': v, '10m_p95': v, ... }
  const byTime = new Map<string, Record<string, number | string>>();
  for (const r of data.series) {
    const t = String(r.bucket);
    if (!byTime.has(t)) byTime.set(t, { bucket: t });
    byTime.get(t)![`${r.age_bucket}_p95`] = Number(r.p95_ms);
  }
  const rows = Array.from(byTime.values()).sort((a, b) =>
    String(a.bucket).localeCompare(String(b.bucket))
  );
  const ages = Array.from(new Set(data.series.map((r) => r.age_bucket)));
  const lineColors: Record<string, string> = {
    immediate: colors.green,
    "10m": colors.cyan,
    "1d": colors.blue,
    "7d": colors.yellow,
    "17d": colors.purple,
    "18d": colors.red,
  };
  return (
    <Card
      title="S2 · Sidecar Retrieval Latency (p95)"
      subtitle="age bucket 별 p95 retrieval latency 추세. p99 가 부풀어 오르면 18d cliff 도래 전 leading indicator."
    >
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="bucket" stroke={colors.axis} fontSize={11}
              tickFormatter={(v) => String(v).slice(11, 16)}
            />
            <YAxis stroke={colors.axis} fontSize={12} tickFormatter={(v) => `${v}ms`} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {ages.map((a) => (
              <Line
                key={a}
                type="monotone"
                dataKey={`${a}_p95`}
                name={a}
                stroke={lineColors[a] ?? colors.blue}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── S3: Self-probe end-to-end retrievability ──────────────────────────
type SelfProbeE2E = {
  summary: {
    total: number;
    submitted_ok: number;
    retrieved: number;
    retrieval_failed: number;
    retrieval_pending: number;
    data_match_ok: number;
    data_mismatch: number;
    avg_retrieve_ms: number | null;
    first_probe: string | null;
    last_probe: string | null;
  };
  recent: Array<{
    probe_id: string;
    submit_timestamp: string;
    submit_status: string;
    retrieve_success: boolean | null;
    blob_age_hours: number | null;
    retrieve_latency_ms: number | null;
    data_match: boolean | null;
    error: string | null;
  }>;
};
export function S3_SelfProbeE2E() {
  const { data, err, loading } = useApi<SelfProbeE2E>("self_probe_e2e");
  if (err) return <Card title="S3 · Self-Probe E2E"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="S3 · Self-Probe E2E"><Loading /></Card>;
  const s = data.summary;
  const retrievedPct = s.submitted_ok
    ? (100 * s.retrieved) / s.submitted_ok
    : 0;
  return (
    <Card
      title="S3 · Self-Probe End-to-End"
      subtitle="자기가 보낸 blob 을 직접 retrieve. 양쪽 끝을 다 알고 있으므로 가장 강한 safety 증거."
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <StatTile label="총 probe" value={String(s.total)} sub={`confirmed ${s.submitted_ok}`} />
        <StatTile
          label="retrieved"
          value={`${s.retrieved}/${s.submitted_ok}`}
          tone={retrievedPct >= 99 ? "ok" : retrievedPct >= 95 ? "warn" : s.retrieved > 0 ? "warn" : undefined}
          sub={`${retrievedPct.toFixed(1)}% e2e`}
        />
        <StatTile
          label="data_match"
          value={`${s.data_match_ok}`}
          tone={s.data_mismatch > 0 ? "critical" : "ok"}
          sub={s.data_mismatch > 0 ? `${s.data_mismatch} mismatch` : "전부 일치"}
        />
      </div>
      <div className="mt-4 overflow-auto max-h-[200px] border border-card-border rounded">
        <table className="w-full text-xs font-mono">
          <thead className="text-muted sticky top-0 bg-card-bg">
            <tr>
              <th className="text-left p-2">submit_ts</th>
              <th className="text-left p-2">status</th>
              <th className="text-right p-2">age_h</th>
              <th className="text-right p-2">retr</th>
              <th className="text-right p-2">match</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((r) => (
              <tr key={r.probe_id} className="border-t border-card-border">
                <td className="p-2 text-muted">{r.submit_timestamp?.slice(5, 16).replace("T", " ")}</td>
                <td className="p-2">
                  <span
                    className={
                      r.submit_status === "confirmed"
                        ? "text-accent-green"
                        : r.submit_status === "pending"
                        ? "text-accent-yellow"
                        : "text-accent-red"
                    }
                  >
                    {r.submit_status}
                  </span>
                </td>
                <td className="p-2 text-right">{r.blob_age_hours ?? "—"}</td>
                <td className="p-2 text-right">
                  {r.retrieve_success === true
                    ? "✓"
                    : r.retrieve_success === false
                    ? <span className="text-accent-red">✗</span>
                    : <span className="text-muted">…</span>}
                </td>
                <td className="p-2 text-right">
                  {r.data_match === true
                    ? "✓"
                    : r.data_match === false
                    ? <span className="text-accent-red">✗</span>
                    : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted mt-2">
        avg retrieve {fmtMs(s.avg_retrieve_ms)} · {s.first_probe?.slice(0, 10)} → {s.last_probe?.slice(0, 10)}
      </div>
    </Card>
  );
}

// ─── S4: Client diversity (CL/EL peers) ─────────────────────────────────
type ClientDiversity = {
  dist: Array<{ client: string; peers: number; pct: string | number }>;
  safety_threshold_pct: number;
};
export function S4_ClientDiversity() {
  const { data, err, loading } = useApi<ClientDiversity>("client_diversity");
  if (err) return <Card title="S4 · Client Diversity"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="S4 · Client Diversity"><Loading /></Card>;
  const total = data.dist.reduce((a, b) => a + Number(b.peers), 0);
  const maxClient = data.dist[0];
  const maxPct = Number(maxClient?.pct ?? 0);
  const supermajority = maxPct > data.safety_threshold_pct;
  return (
    <Card
      title="S4 · CL Client Diversity (Observed Peers)"
      subtitle={`연결된 피어들의 클라이언트 분포. 단일 클라이언트 > ⅔ (${data.safety_threshold_pct}%) 이면 Casper FFG safety 위협.`}
    >
      <div className="mb-3">
        <StatTile
          label="최다 클라이언트"
          value={`${maxClient?.client ?? "?"} · ${maxPct.toFixed(1)}%`}
          tone={supermajority ? "critical" : maxPct > 50 ? "warn" : "ok"}
          sub={`total ${total} peers`}
        />
      </div>
      <div className="space-y-2">
        {data.dist.map((c) => {
          const pct = Number(c.pct);
          const color = pct > data.safety_threshold_pct
            ? colors.red
            : pct > 50
            ? colors.yellow
            : colors.green;
          return (
            <div key={c.client}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-mono">{c.client}</span>
                <span className="text-muted">{c.peers} · {pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-card-border rounded overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-muted">
        ⓘ 이 node 가 본 peer 분포 — 네트워크 전체 분포의 표본.
      </div>
    </Card>
  );
}
