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
  // PG COUNT(*) returns bigint as string; coerce r.n to Number so reduce
  // doesn't string-concatenate ("0" + "452" + "388" = "0452388").
  const rows = data.series.map((r) => ({
    t: String(r.bucket),
    p50: Number(r.p50_ms),
    p95: Number(r.p95_ms),
    n: Number(r.n),
  }));
  const latest = rows[rows.length - 1];
  const totalN = rows.reduce((a, b) => a + b.n, 0);
  return (
    <Card
      wide
      title="C2 · /blob_sidecars HTTP Response Time"
      subtitle={`자기 LH 가 GET /eth/v1/beacon/blob_sidecars/{slot} 응답에 걸리는 시간 (LH-side 부하 진단용). 진짜 gossip 도착 시각은 C3 참고. 4s 라인은 단순 참고선.`}
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
          value={totalN.toLocaleString()}
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

// ─── C3: True gossip arrival latency (data_column_sidecar SSE) ──────────
type GossipArrival = {
  series: Array<{ bucket: string; p50_ms: number; p95_ms: number; n: number }>;
  summary: {
    n: number;
    p50_ms: number | null;
    p95_ms: number | null;
    over_deadline: number;
  };
  attestation_deadline_ms: number;
};
export function C3_GossipArrival() {
  const { data, err, loading } = useApi<GossipArrival>("gossip_arrival");
  if (err) return <Card title="C3 · Gossip Arrival"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="C3 · Gossip Arrival"><Loading /></Card>;
  const rows = data.series.map((r) => ({
    t: String(r.bucket),
    p50: Number(r.p50_ms),
    p95: Number(r.p95_ms),
    n: r.n,
  }));
  const s = data.summary;
  const overPct = s.n > 0 ? (100 * s.over_deadline) / s.n : 0;
  return (
    <Card
      wide
      title="C3 · True Gossip Arrival Latency (data_column_sidecar SSE)"
      subtitle={`own LH mesh 노드가 column 받은 *실제* 시각 − slot_start. PeerDAS 환경에서 blob 의 4s attestation deadline 비교의 honest 측정 (C2 는 polling proxy, 비교용).`}
    >
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatTile label="24h p50" value={fmtMs(s.p50_ms)} />
        <StatTile
          label="24h p95"
          value={fmtMs(s.p95_ms)}
          tone={s.p95_ms != null && s.p95_ms > data.attestation_deadline_ms ? "warn" : "ok"}
          sub={`deadline ${data.attestation_deadline_ms}ms`}
        />
        <StatTile
          label="over deadline"
          value={`${s.over_deadline}`}
          tone={overPct > 1 ? "critical" : overPct > 0.1 ? "warn" : "ok"}
          sub={`${overPct.toFixed(2)}% (n=${s.n})`}
        />
        <StatTile label="24h 샘플" value={String(s.n)} sub="blobs w/ gossip ts" />
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
              label={{ value: "attest deadline 4s", fill: colors.red, fontSize: 10 }}
            />
            <Line type="monotone" dataKey="p50" name="p50" stroke={colors.green} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="p95" name="p95" stroke={colors.cyan} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── C4: Chain reorg timeline ───────────────────────────────────────────
type ReorgTimeline = {
  events: Array<{
    timestamp: string; slot: number;
    depth: number | null; epoch: number | null;
    affected_blob_count: number | null;
    old_head_block: string | null; new_head_block: string | null;
  }>;
  summary: {
    total_7d: number;
    deep_7d: number;
    affected_blobs_7d: number | null;
    max_depth_7d: number | null;
    latest: string | null;
  };
};
export function C4_ReorgTimeline() {
  const { data, err, loading } = useApi<ReorgTimeline>("reorg_timeline");
  if (err) return <Card title="C4 · Reorg Timeline"><ErrBox msg={err} /></Card>;
  if (loading || !data) return <Card title="C4 · Reorg Timeline"><Loading /></Card>;
  const s = data.summary;
  return (
    <Card
      title="C4 · Chain Reorg Timeline (own LH SSE)"
      subtitle="chain_reorg event 가 들어오면 depth × affected blob count 와 함께 기록. depth ≥ 2 는 liveness + safety 양쪽 신호."
    >
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatTile
          label="7d reorgs"
          value={String(s.total_7d)}
          tone={s.total_7d > 10 ? "warn" : s.total_7d > 50 ? "critical" : "ok"}
        />
        <StatTile
          label="deep (≥2)"
          value={String(s.deep_7d)}
          tone={s.deep_7d > 0 ? "warn" : "ok"}
        />
        <StatTile
          label="affected blobs"
          value={s.affected_blobs_7d == null ? "—" : String(s.affected_blobs_7d)}
          sub="reorg 슬롯에서 사라진 sidecar"
        />
        <StatTile
          label="max depth"
          value={s.max_depth_7d == null ? "—" : String(s.max_depth_7d)}
        />
      </div>
      <div className="overflow-auto max-h-[260px] border border-card-border rounded">
        <table className="w-full text-xs font-mono">
          <thead className="text-muted sticky top-0 bg-card-bg">
            <tr>
              <th className="text-left p-2">timestamp</th>
              <th className="text-right p-2">slot</th>
              <th className="text-right p-2">depth</th>
              <th className="text-right p-2">affected</th>
              <th className="text-right p-2">epoch</th>
            </tr>
          </thead>
          <tbody>
            {data.events.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted">
                  reorg 이벤트 없음 (관측 기간 동안 안정)
                </td>
              </tr>
            ) : (
              data.events.map((r) => (
                <tr key={`${r.timestamp}-${r.slot}`} className="border-t border-card-border">
                  <td className="p-2 text-muted">
                    {r.timestamp?.slice(5, 19).replace("T", " ")}
                  </td>
                  <td className="p-2 text-right">{r.slot}</td>
                  <td className={`p-2 text-right ${(r.depth ?? 0) >= 2 ? "text-accent-yellow" : ""}`}>
                    {r.depth ?? "—"}
                  </td>
                  <td className={`p-2 text-right ${(r.affected_blob_count ?? 0) > 0 ? "text-accent-red" : ""}`}>
                    {r.affected_blob_count ?? "—"}
                  </td>
                  <td className="p-2 text-right text-muted">{r.epoch ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-muted">
        ⓘ data source: <code>eth_reorgs</code> (own LH /eth/v1/events?topics=chain_reorg)
      </div>
    </Card>
  );
}
