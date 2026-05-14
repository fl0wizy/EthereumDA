"use client";

import type { DAStatus } from "../data/mock";

function StatusBadge({ status }: { status: DAStatus["status"] }) {
  const colors = {
    operational: "bg-accent-green/20 text-accent-green",
    degraded: "bg-accent-yellow/20 text-accent-yellow",
    down: "bg-accent-red/20 text-accent-red",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
      {status === "operational" ? "Operational" : status === "degraded" ? "Degraded" : "Down"}
    </span>
  );
}

function RiskBadge({ risk }: { risk: DAStatus["spofRisk"] }) {
  const colors = {
    low: "bg-accent-green/15 text-accent-green border-accent-green/30",
    medium: "bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30",
    high: "bg-accent-red/15 text-accent-red border-accent-red/30",
    critical: "bg-accent-red/20 text-[#ff4444] border-accent-red/50",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${colors[risk]}`}>
      {risk}
    </span>
  );
}

function MetricRow({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-sm font-mono font-medium ${warn ? "text-accent-yellow" : ""}`}>
        {value}
        {unit && <span className="text-xs text-muted ml-1">{unit}</span>}
      </span>
    </div>
  );
}

export default function StatusCard({ da }: { da: DAStatus }) {
  const formatMs = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  return (
    <div
      className="bg-card-bg border border-card-border rounded-xl p-5 hover:border-muted/50 transition-colors"
      style={{ borderTopColor: da.color, borderTopWidth: "3px" }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-base">{da.name}</h3>
          <p className="text-xs text-muted mt-0.5">{da.activeInfra}</p>
        </div>
        <StatusBadge status={da.status} />
      </div>

      {/* Metrics */}
      <div className="space-y-0.5 border-t border-card-border pt-3">
        <MetricRow label="Submit Latency (p50)" value={formatMs(da.submitLatencyP50)} />
        <MetricRow label="Submit Latency (p95)" value={formatMs(da.submitLatencyP95)} />
        <MetricRow
          label="Retrieval Success (24h)"
          value={`${da.retrievalSuccess24h}%`}
          warn={da.retrievalSuccess24h < 100}
        />
        <MetricRow
          label="Blob Survival (30d)"
          value={da.blobSurvival30d !== null ? `${da.blobSurvival30d}%` : "N/A (pruned)"}
          warn={da.blobSurvival30d !== null && da.blobSurvival30d < 95}
        />
        <MetricRow label="Uptime (7d)" value={`${da.uptimeLast7d}%`} warn={da.uptimeLast7d < 99.5} />
      </div>

      {/* SPOF Risk */}
      <div className="mt-4 pt-3 border-t border-card-border">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-muted">SPOF Risk</span>
          <RiskBadge risk={da.spofRisk} />
        </div>
        <p className="text-xs text-muted leading-relaxed">{da.spofReason}</p>
      </div>
    </div>
  );
}
