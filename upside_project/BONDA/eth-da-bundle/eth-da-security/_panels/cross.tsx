"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Legend, ResponsiveContainer,
} from "recharts";
import {
  Card, ErrBox, Loading, StatTile, colors, tooltipStyle, useApi, fmtMs,
} from "./shared";

// ─── C1: Casper FFG threshold readout (EigenDA-style translation) ──────
type CasperThreshold = {
  latest_finality: {
    timestamp: string;
    finalized_epoch: number;
    current_justified_epoch: number;
    previous_justified_epoch: number;
  } | null;
  latest_head: {
    timestamp: string;
    head_slot: number;
    sync_distance: number;
    lighthouse_connected_peers: number | null;
    geth_peer_count: number | null;
  } | null;
  finality_gap: { seconds_since_last_finality_update: number; last_interval_seconds: number | null } | null;
  safety_threshold_pct: number;
  liveness_threshold_pct: number;
};
export function C1_CasperReadout() {
  const { data, err, loading } = useApi<CasperThreshold>("casper_threshold");
  if (err) return <Card title="C1 · Casper FFG Threshold"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="C1 · Casper FFG Threshold"><Loading /></Card>;
  const head = data.latest_head;
  const fin = data.latest_finality;
  const gap = data.finality_gap;
  const headEpoch = head ? Math.floor(head.head_slot / 32) : null;
  const epochsBehind = headEpoch != null && fin ? headEpoch - fin.finalized_epoch : null;
  const gapTone = gap == null
    ? undefined
    : gap.seconds_since_last_finality_update > 768
    ? "critical"
    : gap.seconds_since_last_finality_update > 384
    ? "warn"
    : "ok";
  return (
    <Card
      wide
      title="C1 · Casper FFG Threshold Readout (EigenDA-style translation)"
      subtitle="Ethereum DA 는 별도 quorum 이 없고 Consensus 의 threshold 를 그대로 상속. 아래는 EigenDA spec 용어로의 1:1 매핑."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="border border-card-border rounded-lg p-4 bg-card-bg/40">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            Safety Threshold
          </div>
          <div className="text-3xl font-bold font-mono leading-tight">
            ⅓ (≥{data.safety_threshold_pct}%)
          </div>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            공격자가 이 만큼의 stake 를 control 해야 finality 공격(safety 위반) 가능.
            EigenDA quorum 의 “safety threshold” 와 동일 차원.
          </p>
        </div>
        <div className="border border-card-border rounded-lg p-4 bg-card-bg/40">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">
            Liveness Threshold
          </div>
          <div className="text-3xl font-bold font-mono leading-tight">
            ⅓ (≥{data.liveness_threshold_pct}%)
          </div>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            이 만큼이 오프라인이면 finality 정지. 현재 finality gap 으로 우회 관측.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile
          label="head slot"
          value={head ? String(head.head_slot) : "—"}
          sub={headEpoch != null ? `epoch ${headEpoch}` : undefined}
        />
        <StatTile
          label="finalized epoch"
          value={fin ? String(fin.finalized_epoch) : "—"}
          sub={fin ? `slot ${fin.finalized_epoch * 32}` : undefined}
        />
        <StatTile
          label="epochs behind"
          value={epochsBehind == null ? "—" : String(epochsBehind)}
          tone={
            epochsBehind == null
              ? undefined
              : epochsBehind > 4
              ? "critical"
              : epochsBehind > 2
              ? "warn"
              : "ok"
          }
          sub="head_epoch − finalized"
        />
        <StatTile
          label="last finality"
          value={gap ? `${gap.seconds_since_last_finality_update}s ago` : "—"}
          tone={gapTone}
          sub="384s 가 정상 cadence"
        />
      </div>
      <div className="mt-4 text-xs text-muted border-t border-card-border pt-3 leading-relaxed">
        ⓘ EigenDA 의 “quorum 별 safety/liveness threshold” 와 달리 Ethereum 은 DA-specific quorum 이
        없음. blob 의 availability 는 “해당 block 이 attest 됐는가 + 18.2d 이내인가” 와 동치이고,
        그 판정 자체가 위 ⅔ honest-majority 가정에 묶임 (Casper FFG / LMD-GHOST).
      </div>
    </Card>
  );
}

// ─── C2: Sidecar gossip propagation ────────────────────────────────────
type SidecarProp = {
  series: Array<{ bucket: string; p50_ms: number; p95_ms: number; n: number }>;
  attestation_deadline_ms: number;
};
export function C2_SidecarPropagation() {
  const { data, err, loading } = useApi<SidecarProp>("sidecar_propagation");
  if (err) return <Card title="C2 · Sidecar Propagation"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="C2 · Sidecar Propagation"><Loading /></Card>;
  const rows = data.series.map((r) => ({
    t: String(r.bucket),
    p50: Number(r.p50_ms),
    p95: Number(r.p95_ms),
    n: r.n,
  }));
  const latest = rows[rows.length - 1];
  return (
    <Card
      wide
      title="C2 · Sidecar Gossip Propagation Latency"
      subtitle={`block 발생 후 blob sidecar 가 우리 node 에 처음 보이기까지의 시간. 4초 attestation deadline 안에 들어와야 attester 가 head 를 vote.`}
    >
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatTile label="현재 p50" value={latest ? fmtMs(latest.p50) : "—"} />
        <StatTile
          label="현재 p95"
          value={latest ? fmtMs(latest.p95) : "—"}
          tone={latest && latest.p95 > data.attestation_deadline_ms ? "warn" : "ok"}
          sub={`deadline ${data.attestation_deadline_ms}ms`}
        />
        <StatTile
          label="24h 샘플"
          value={String(rows.reduce((a, b) => a + b.n, 0))}
          sub="blob sidecars"
        />
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="t" stroke={colors.axis} fontSize={11}
              tickFormatter={(v) => String(v).slice(11, 16)}
            />
            <YAxis
              stroke={colors.axis} fontSize={12}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={((v: unknown, n: unknown) => [fmtMs(Number(v)), n as string]) as never}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine
              y={data.attestation_deadline_ms}
              stroke={colors.red}
              strokeDasharray="4 4"
              label={{ value: "attest deadline", fill: colors.red, fontSize: 10 }}
            />
            <Line type="monotone" dataKey="p50" name="p50" stroke={colors.blue} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="p95" name="p95" stroke={colors.purple} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
