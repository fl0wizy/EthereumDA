"use client";

import type { SpecVsReality } from "../data/mock";

function SeverityBadge({ severity }: { severity: SpecVsReality["severity"] }) {
  const map = {
    critical: { label: "Critical", cls: "bg-accent-red/15 text-accent-red border-accent-red/40" },
    warning: { label: "Warning", cls: "bg-accent-yellow/15 text-accent-yellow border-accent-yellow/40" },
    info: { label: "Info", cls: "bg-accent-blue/15 text-accent-blue border-accent-blue/40" },
  } as const;
  const s = map[severity];
  return (
    <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase border ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function SpecVsRealityCard({ item }: { item: SpecVsReality }) {
  const borderColor = {
    critical: "border-accent-red/40",
    warning: "border-accent-yellow/30",
    info: "border-card-border",
  }[item.severity];

  const accentLine = {
    critical: "border-l-accent-red",
    warning: "border-l-accent-yellow",
    info: "border-l-accent-blue",
  }[item.severity];

  const daColors: Record<string, string> = {
    eigenda: "#7c3aed",
    ethereumda: "#627eea",
    celestia: "#8b5cf6",
    avail: "#06b6d4",
  };

  return (
    <article className={`border ${borderColor} border-l-4 ${accentLine} bg-card-bg rounded-xl p-6`}>
      <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="px-2.5 py-1 rounded text-xs font-bold tracking-wider uppercase"
            style={{
              backgroundColor: `${daColors[item.da]}25`,
              color: daColors[item.da],
            }}
          >
            {item.daName}
          </span>
          <h3 className="text-lg font-bold">{item.category}</h3>
        </div>
        <SeverityBadge severity={item.severity} />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted mb-2">스펙</div>
          <p className="text-base leading-relaxed text-foreground/80">{item.claim}</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-accent-red mb-2">현실</div>
          <p className="text-base leading-relaxed font-medium">{item.reality}</p>
        </div>
      </div>

      <div className="bg-background/60 border border-card-border rounded-lg px-4 py-3 mb-3">
        <span className="text-xs uppercase tracking-wider text-muted">증거 · </span>
        <span className="text-sm font-mono leading-relaxed">{item.evidence}</span>
      </div>

      <p className="text-xs text-muted">
        마지막 검증: {new Date(item.lastChecked).toLocaleString("ko-KR", { timeZone: "UTC" })} UTC
      </p>
    </article>
  );
}
