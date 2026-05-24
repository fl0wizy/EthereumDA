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
  // Render as horizontal bar gauges (one row per age bucket). When rates
  // sit near 100% a vertical BarChart shows a wall of identical bars —
  // gauges magnify the small deficits that actually matter.
  const rows = data.buckets.map((b) => ({
    bucket: b.age_bucket,
    rate: Number(b.rate_pct),
    total: Number(b.total),
    p95_ms: b.p95_ms,
  }));
  const colorFor = (r: number) =>
    r >= 99.5 ? colors.green : r >= 99 ? colors.yellow : r >= 95 ? "#f59e0b" : colors.red;
  return (
    <Card
      wide
      title="S1 · Blob Survival Rate by Age Bucket"
      subtitle={`퍼블릭 블롭의 age bucket 별 retrieval 성공률. 스펙상 retention = ${data.retention_days}일 (MIN_EPOCHS_FOR_BLOB_SIDECARS_REQUESTS = 4096). 18d 이내에서 100% 가 아니면 safety 사고.`}
    >
      <div className="space-y-2.5">
        {rows.map((r) => {
          const color = colorFor(r.rate);
          const isFull = r.rate >= 99.995; // visually round-up to 100.00%
          return (
            <div key={r.bucket} className="flex items-center gap-3 text-xs">
              <div className="w-10 font-mono uppercase tracking-wider text-muted">
                {r.bucket}
              </div>
              <div className="flex-1 h-3 rounded overflow-hidden relative bg-card-border/40">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.max(0, Math.min(r.rate, 100))}%`,
                    background: color,
                  }}
                />
                {!isFull && (
                  <div
                    className="absolute top-0 h-full border-l border-accent-red/60"
                    style={{ left: "100%", transform: "translateX(-1px)" }}
                  />
                )}
              </div>
              <div className="w-16 font-mono text-right tabular-nums" style={{ color }}>
                {r.rate.toFixed(2)}%
              </div>
              <div className="w-32 text-muted text-right tabular-nums">
                {r.total} · p95 {fmtMs(r.p95_ms)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-card-border flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: colors.green }} /> ≥ 99.5%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: colors.yellow }} /> 99–99.5%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#f59e0b" }} /> 95–99%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: colors.red }} /> &lt; 95%
        </span>
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
  // For each age_bucket, compute the *current* p95 (latest time bucket) and
  // a 48h sparkline. A wall of overlapping lines (the old design) buried the
  // single signal we care about: which bucket is creeping up.
  const ageOrder = ["immediate", "10m", "1d", "7d", "17d", "18d", "19d"];
  const byAge = new Map<string, { spark: Array<{ t: string; v: number }>; n_total: number }>();
  for (const r of data.series) {
    if (!byAge.has(r.age_bucket)) byAge.set(r.age_bucket, { spark: [], n_total: 0 });
    const bucket = byAge.get(r.age_bucket)!;
    bucket.spark.push({ t: String(r.bucket), v: Number(r.p95_ms) });
    bucket.n_total += Number(r.n);
  }
  const ages = Array.from(byAge.keys()).sort((a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b));
  // Latency thresholds (global, not bucket-relative — keep cognitive load low)
  const colorForMs = (ms: number | null) =>
    ms == null ? colors.axis
    : ms < 300  ? colors.green
    : ms < 1000 ? colors.yellow
    : ms < 3000 ? "#f59e0b"
    : colors.red;
  return (
    <Card
      title="S2 · Sidecar Retrieval p95 Latency (48h)"
      subtitle="age bucket 별 현재 p95 + 48h trend. p95 가 부풀어 오르면 18d cliff 도래 전 leading indicator."
    >
      <div className="space-y-2.5">
        {ages.map((age) => {
          const b = byAge.get(age)!;
          const sortedSpark = b.spark.slice().sort((x, y) => x.t.localeCompare(y.t));
          const current = sortedSpark.length ? sortedSpark[sortedSpark.length - 1].v : null;
          const first = sortedSpark.length ? sortedSpark[0].v : null;
          const delta = current != null && first != null && first > 0
            ? ((current - first) / first) * 100 : null;
          const color = colorForMs(current);
          return (
            <div key={age} className="flex items-center gap-3 text-xs">
              <div className="w-10 font-mono uppercase tracking-wider text-muted">{age}</div>
              <div className="flex-1 h-8">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sortedSpark} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                    <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={((v: unknown) => String(v).slice(5, 16).replace("T", " ")) as never}
                      formatter={((v: unknown) => [fmtMs(Number(v)), "p95"]) as never}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="w-16 font-mono text-right tabular-nums" style={{ color }}>
                {fmtMs(current)}
              </div>
              <div className="w-16 text-right tabular-nums text-muted">
                {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`}
              </div>
              <div className="w-20 text-muted text-right tabular-nums">
                n={b.n_total}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-card-border flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: colors.green }} /> &lt; 300ms</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: colors.yellow }} /> &lt; 1s</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#f59e0b" }} /> &lt; 3s</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: colors.red }} /> ≥ 3s</span>
        <span className="ml-auto">Δ = 48h 시작 대비 변화율</span>
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

// ─── S5: Multi-source retrieval breadth (K/N) ──────────────────────────
type MultiSourceBreadth = {
  per_source: Array<{
    source: string; age_bucket: string;
    total: number; available: number;
    rate_pct: string | number;
  }>;
  k_dist: Array<{
    age_bucket: string;
    k0: number; k1: number; k2: number; k3: number;
    total: number;
  }>;
  n_total: number;
};
export function S5_MultiSourceBreadth() {
  const { data, err, loading } = useApi<MultiSourceBreadth>("multi_source_breadth");
  if (err) return <Card title="S5 · Multi-source Breadth"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="S5 · Multi-source Breadth"><Loading /></Card>;
  const ageOrder = ["immediate", "10m", "1d", "7d", "17d", "18d", "19d"];
  // Per-source aggregate (across age buckets) — single rate per source. Numbers
  // come from PG as strings, coerce before arithmetic.
  const sourceAgg = new Map<string, { total: number; available: number }>();
  for (const r of data.per_source) {
    const s = sourceAgg.get(r.source) ?? { total: 0, available: 0 };
    s.total += Number(r.total);
    s.available += Number(r.available);
    sourceAgg.set(r.source, s);
  }
  const sources = Array.from(sourceAgg.entries()).sort();
  const sourceColors: Record<string, string> = {
    local: colors.blue,
    publicnode: colors.green,
    drpc: colors.purple,
  };
  const kDistSorted = data.k_dist.slice().sort((a, b) =>
    ageOrder.indexOf(a.age_bucket) - ageOrder.indexOf(b.age_bucket)
  );
  // K segment colors (best → worst)
  const kColor = { k3: colors.green, k2: "#84cc16", k1: colors.yellow, k0: colors.red };
  return (
    <Card
      wide
      title="S5 · Multi-source Retrieval Breadth (K/N)"
      subtitle={`독립 CL provider ${data.n_total} 곳 (local + publicnode + drpc) 에서 같은 blob 을 retrieve. K = 보유한 source 수. K=N 이면 가장 안전, K=0 = 전 네트워크 분실.`}
    >
      <div className="text-xs uppercase tracking-wider text-muted mb-2">Per-source success (24h)</div>
      <div className="space-y-2 mb-5">
        {sources.map(([source, agg]) => {
          const rate = agg.total > 0 ? (100 * agg.available) / agg.total : 0;
          return (
            <div key={source} className="flex items-center gap-3 text-xs">
              <div className="w-24 font-mono text-muted">{source}</div>
              <div className="flex-1 h-2.5 rounded overflow-hidden bg-card-border/40">
                <div className="h-full" style={{ width: `${rate}%`, background: sourceColors[source] ?? colors.cyan }} />
              </div>
              <div className="w-16 font-mono text-right tabular-nums">{rate.toFixed(2)}%</div>
              <div className="w-24 text-muted text-right tabular-nums">{agg.available}/{agg.total}</div>
            </div>
          );
        })}
      </div>
      <div className="text-xs uppercase tracking-wider text-muted mb-2">K 분포 per age bucket</div>
      <div className="space-y-2.5">
        {kDistSorted.map((r) => {
          const total = Number(r.total);
          if (total === 0) return null;
          const k0 = Number(r.k0), k1 = Number(r.k1), k2 = Number(r.k2), k3 = Number(r.k3);
          const pct = (n: number) => (100 * n) / total;
          const hasLoss = k0 + k1 > 0;
          return (
            <div key={r.age_bucket} className="flex items-center gap-3 text-xs">
              <div className="w-10 font-mono uppercase tracking-wider text-muted">{r.age_bucket}</div>
              <div className="flex-1 h-4 rounded overflow-hidden flex bg-card-border/40">
                {k3 > 0 && <div title={`K=3: ${k3}`} style={{ width: `${pct(k3)}%`, background: kColor.k3 }} />}
                {k2 > 0 && <div title={`K=2: ${k2}`} style={{ width: `${pct(k2)}%`, background: kColor.k2 }} />}
                {k1 > 0 && <div title={`K=1: ${k1}`} style={{ width: `${pct(k1)}%`, background: kColor.k1 }} />}
                {k0 > 0 && <div title={`K=0: ${k0}`} style={{ width: `${pct(k0)}%`, background: kColor.k0 }} />}
              </div>
              <div className={`w-16 font-mono text-right tabular-nums ${hasLoss ? "text-accent-red" : "text-accent-green"}`}>
                {pct(k3).toFixed(1)}%
              </div>
              <div className="w-20 text-muted text-right tabular-nums">n={total}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-card-border flex items-center gap-4 text-xs text-muted flex-wrap">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: kColor.k3 }} /> K=3 (모두)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: kColor.k2 }} /> K=2</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: kColor.k1 }} /> K=1</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: kColor.k0 }} /> K=0 (분실)</span>
        <span className="ml-auto">우측 % = K=3 비율 (높을수록 안전)</span>
      </div>
    </Card>
  );
}

// ─── S6: KZG verification integrity rate ───────────────────────────────
type KzgIntegrity = {
  series: Array<{
    bucket: string;
    verified_true: number; verified_false: number;
    evaluated: number; total: number;
    rate_pct: string | number | null;
  }>;
  summary: {
    verified_true: number;
    verified_false: number;
    unverified: number;
    total: number;
  };
};
export function S6_KzgIntegrity() {
  const { data, err, loading } = useApi<KzgIntegrity>("kzg_integrity");
  if (err) return <Card title="S6 · KZG Integrity"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="S6 · KZG Integrity"><Loading /></Card>;
  // PG COUNT(*) ships as string in JSON; coerce before arithmetic so the
  // + operator doesn't concatenate (would have given evaluated="25440" for
  // true=2544 + false=0 → ratePct = 10% instead of 100%).
  const trueCt  = Number(data.summary.verified_true);
  const falseCt = Number(data.summary.verified_false);
  const nullCt  = Number(data.summary.unverified);
  const evaluated = trueCt + falseCt;
  const ratePct = evaluated > 0 ? (100 * trueCt) / evaluated : 0;
  const s = data.summary;
  const rows = data.series.map((r) => ({
    t: String(r.bucket),
    rate: r.rate_pct == null ? null : Number(r.rate_pct),
    evaluated: r.evaluated,
    false_n: r.verified_false,
  }));
  const falseSeries = data.series.map((r) => ({
    t: String(r.bucket), v: Number(r.verified_false),
  })).sort((a, b) => a.t.localeCompare(b.t));
  const anomalyFree = falseCt === 0;
  return (
    <Card
      title="S6 · KZG Verification Integrity"
      subtitle="blob 의 commitment 를 ckzg 로 재계산해서 헤더 commitment 와 비교. False 가 나오면 payload 변조 신호 — mainnet 에서 정상은 100%."
    >
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatTile
          label="24h verified rate"
          value={`${ratePct.toFixed(2)}%`}
          tone={ratePct >= 99.99 ? "ok" : ratePct >= 99 ? "warn" : "critical"}
          sub={`${trueCt} of ${evaluated} evaluated`}
        />
        <StatTile
          label="integrity failures"
          value={String(falseCt)}
          tone={falseCt > 0 ? "critical" : "ok"}
          sub={anomalyFree ? "no commitment mismatch" : "commitment 불일치 발견"}
        />
        <StatTile
          label="unverified"
          value={nullCt.toLocaleString()}
          sub="blob 필드 부재 / 미평가"
        />
      </div>
      {anomalyFree ? (
        <div className="flex items-center gap-2 text-xs text-accent-green border border-accent-green/30 bg-accent-green/5 rounded px-3 py-2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent-green" />
          24h 무사고 — 모든 평가된 blob 이 cryptographic 검증 통과
        </div>
      ) : (
        <div className="h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={falseSeries} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={((v: unknown) => String(v).slice(5, 16).replace("T", " ")) as never}
                formatter={((v: unknown) => [`${v} failures`, "false"]) as never}
              />
              <Line type="monotone" dataKey="v" stroke={colors.red} strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
