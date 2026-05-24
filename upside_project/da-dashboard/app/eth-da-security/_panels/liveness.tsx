"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, ScatterChart, Scatter, AreaChart, Area,
} from "recharts";
import {
  Card, ErrBox, Loading, StatTile, colors, tooltipStyle, useApi, fmtMs, fmtWei,
} from "./shared";

// ─── L1: blobs per slot ─────────────────────────────────────────────────
type BlobsPerSlot = {
  series: Array<{ bucket: string; avg_blobs: number; max_blobs: number; slots: number }>;
  summary: { slots: number; slots_with_blobs: number; total_blobs: string; avg_per_slot: string };
  target: number;
  cap: number;
};
export function L1_BlobsPerSlot() {
  const { data, err, loading } = useApi<BlobsPerSlot>("blobs_per_slot");
  if (err) return <Card title="L1 · Blobs per Slot"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="L1 · Blobs per Slot"><Loading /></Card>;
  const rows = data.series.map((r) => ({
    t: String(r.bucket),
    avg: Number(r.avg_blobs),
    max: Number(r.max_blobs),
  }));
  return (
    <Card
      title="L1 · Blobs per Slot (6h)"
      subtitle={`인클루전 처리량. 캡 (${data.cap}) 에 닿으면 fee market 압박 = rollup liveness 저하.`}
    >
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatTile label="6h 총 blob" value={String(data.summary.total_blobs)} />
        <StatTile label="평균 blobs/slot" value={String(data.summary.avg_per_slot)} />
        <StatTile
          label="blob 포함 slot %"
          value={`${((100 * data.summary.slots_with_blobs) / Math.max(data.summary.slots, 1)).toFixed(0)}%`}
        />
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="t" stroke={colors.axis} fontSize={11}
              tickFormatter={(v) => String(v).slice(11, 16)}
            />
            <YAxis stroke={colors.axis} fontSize={12} domain={[0, data.cap + 1]} />
            <Tooltip contentStyle={tooltipStyle} />
            <ReferenceLine y={data.cap} stroke={colors.red} strokeDasharray="4 4" label={{ value: `cap ${data.cap}`, fill: colors.red, fontSize: 11 }} />
            <ReferenceLine y={data.target} stroke={colors.yellow} strokeDasharray="4 4" label={{ value: `target ${data.target}`, fill: colors.yellow, fontSize: 11 }} />
            <Area type="monotone" dataKey="avg" name="avg/slot" stroke={colors.blue} fill={colors.blue} fillOpacity={0.2} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── L2: finality lag ──────────────────────────────────────────────────
type FinalityLag = {
  series: Array<{ bucket: string; head_slot: number; finalized_slot: number | null }>;
  latest: { head_slot: number; finalized_epoch: number; finalized_at: string };
};
export function L2_FinalityLag() {
  const { data, err, loading } = useApi<FinalityLag>("finality_lag");
  if (err) return <Card title="L2 · Finality Lag"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="L2 · Finality Lag"><Loading /></Card>;
  const rows = data.series
    .filter((r) => r.finalized_slot != null && r.head_slot != null)
    .map((r) => ({
      t: String(r.bucket),
      lag: Number(r.head_slot) - Number(r.finalized_slot!),
    }));
  const lagNow = rows.length ? rows[rows.length - 1].lag : null;
  const tone = lagNow == null ? undefined : lagNow > 128 ? "critical" : lagNow > 96 ? "warn" : "ok";
  return (
    <Card
      title="L2 · Finality Lag"
      subtitle="head_slot − finalized_slot. 정상 ≤ 64 slot (2 epoch). > 128 (4 epoch) 이면 finality 가 멈춰가는 중 = liveness 위반."
    >
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatTile
          label="현재 lag"
          value={lagNow == null ? "—" : `${lagNow} slots`}
          tone={tone}
          sub={lagNow != null ? `${(lagNow / 32).toFixed(1)} epochs` : undefined}
        />
        <StatTile
          label="finalized epoch"
          value={String(data.latest.finalized_epoch)}
          sub={`head slot ${data.latest.head_slot}`}
        />
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="t" stroke={colors.axis} fontSize={11}
              tickFormatter={(v) => String(v).slice(11, 16)}
            />
            <YAxis stroke={colors.axis} fontSize={12} tickFormatter={(v) => `${v}`} />
            <Tooltip contentStyle={tooltipStyle} formatter={((v: unknown) => [`${Number(v)} slots`, "lag"]) as never} />
            <ReferenceLine y={64} stroke={colors.yellow} strokeDasharray="4 4" label={{ value: "2 epoch", fill: colors.yellow, fontSize: 10 }} />
            <ReferenceLine y={128} stroke={colors.red} strokeDasharray="4 4" label={{ value: "4 epoch", fill: colors.red, fontSize: 10 }} />
            <Line type="stepAfter" dataKey="lag" stroke={colors.blue} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── L3: blob base fee (excess_blob_gas + computed) ────────────────────
type BlobBasefee = {
  series: Array<{ bucket: string; avg_excess: number; basefee_wei: number | null }>;
  update_fraction: number;
};
export function L3_BlobBasefee() {
  const { data, err, loading } = useApi<BlobBasefee>("blob_basefee");
  if (err) return <Card title="L3 · Blob Base Fee"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="L3 · Blob Base Fee"><Loading /></Card>;
  const rows = data.series.map((r) => ({
    t: String(r.bucket),
    excess: Number(r.avg_excess),
    basefee: r.basefee_wei != null ? Number(r.basefee_wei) : null,
  }));
  const latest = rows[rows.length - 1];
  return (
    <Card
      title="L3 · Blob Fee Market (24h)"
      subtitle={`excess_blob_gas (primary). 베이스피 ≈ exp(excess / ${data.update_fraction}) wei. 지속 상승 = rollup 인클루전 비용 ↑ = liveness 압박.`}
    >
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatTile
          label="현재 excess"
          value={latest ? latest.excess.toExponential(2) : "—"}
          sub="blob_gas"
        />
        <StatTile
          label="추정 base fee"
          value={latest?.basefee != null ? fmtWei(latest.basefee) : "overflow"}
          sub="wei / blob_gas"
        />
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="t" stroke={colors.axis} fontSize={11}
              tickFormatter={(v) => String(v).slice(11, 16)}
            />
            <YAxis
              stroke={colors.axis} fontSize={12}
              tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : String(v)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={((v: unknown) => [Number(v).toExponential(2), "excess"]) as never}
            />
            <Line type="monotone" dataKey="excess" name="excess_blob_gas" stroke={colors.yellow} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── L4: self-probe submit/inclusion latency ───────────────────────────
type InclusionData = {
  points: Array<{ probe_id: string; submit_timestamp: string; submit_latency_ms: number; submit_status: string }>;
  summary: { total: number; confirmed: number; pending: number; failed: number; p50_ms: number; p95_ms: number };
};
export function L4_InclusionLatency() {
  const { data, err, loading } = useApi<InclusionData>("inclusion");
  if (err) return <Card title="L4 · Inclusion Latency"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="L4 · Inclusion Latency"><Loading /></Card>;
  const points = data.points.map((p) => ({
    ts: new Date(p.submit_timestamp).getTime(),
    latency: p.submit_latency_ms,
    status: p.submit_status,
  }));
  return (
    <Card
      title="L4 · Self-Probe Submit Pipeline Latency"
      subtitle="submit_one() 시작 → sendRawTransaction 응답까지의 RPC 파이프라인 시간 (guardrails + 빌드 + 서명 + broadcast). 인클루전 시간은 별도 (P1.4 작업 후 inclusion_latency_ms 컬럼)."
    >
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatTile label="confirmed" value={String(data.summary.confirmed)} sub={`total ${data.summary.total}`} />
        <StatTile label="p50" value={fmtMs(data.summary.p50_ms)} />
        <StatTile
          label="p95"
          value={fmtMs(data.summary.p95_ms)}
          tone={data.summary.p95_ms > 60_000 ? "warn" : "ok"}
        />
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="ts" type="number" domain={["dataMin", "dataMax"]}
              stroke={colors.axis} fontSize={11}
              tickFormatter={(v) => new Date(v).toISOString().slice(5, 10)}
            />
            <YAxis
              dataKey="latency" stroke={colors.axis} fontSize={12}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}s` : `${v}ms`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={((v: unknown) => [fmtMs(Number(v)), "latency"]) as never}
              labelFormatter={((v: unknown) => new Date(Number(v)).toISOString().slice(0, 16)) as never}
            />
            <ReferenceLine y={12000} stroke={colors.yellow} strokeDasharray="4 4" label={{ value: "1 slot", fill: colors.yellow, fontSize: 10 }} />
            <ReferenceLine y={36000} stroke={colors.red} strokeDasharray="4 4" label={{ value: "3 slot", fill: colors.red, fontSize: 10 }} />
            <Scatter data={points} fill={colors.blue} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
