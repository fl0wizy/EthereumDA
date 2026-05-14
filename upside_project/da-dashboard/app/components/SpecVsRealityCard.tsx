"use client";

import type { SpecVsReality } from "../data/mock";

function SeverityIcon({ severity }: { severity: SpecVsReality["severity"] }) {
  if (severity === "critical") {
    return (
      <div className="w-10 h-10 rounded-lg bg-accent-red/15 flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }
  if (severity === "warning") {
    return (
      <div className="w-10 h-10 rounded-lg bg-accent-yellow/15 flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-accent-blue/15 flex items-center justify-center shrink-0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </div>
  );
}

export default function SpecVsRealityCard({ item }: { item: SpecVsReality }) {
  const borderColor = {
    critical: "border-accent-red/40",
    warning: "border-accent-yellow/30",
    info: "border-card-border",
  }[item.severity];

  const bgColor = {
    critical: "bg-accent-red/[0.03]",
    warning: "bg-accent-yellow/[0.02]",
    info: "bg-card-bg",
  }[item.severity];

  const daColors: Record<string, string> = {
    eigenda: "#7c3aed",
    ethereumda: "#627eea",
    celestia: "#8b5cf6",
    avail: "#06b6d4",
  };

  return (
    <div className={`border rounded-xl p-5 ${borderColor} ${bgColor}`}>
      <div className="flex gap-4">
        <SeverityIcon severity={item.severity} />
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: `${daColors[item.da]}20`,
                color: daColors[item.da],
              }}
            >
              {item.daName}
            </span>
            <span className="text-sm font-semibold">{item.category}</span>
          </div>

          {/* Claim vs Reality */}
          <div className="space-y-2 mb-3">
            <div className="flex gap-2">
              <span className="text-xs text-muted shrink-0 w-14 pt-0.5">Claim:</span>
              <p className="text-sm text-muted">{item.claim}</p>
            </div>
            <div className="flex gap-2">
              <span className="text-xs text-accent-red shrink-0 w-14 pt-0.5 font-medium">Reality:</span>
              <p className="text-sm font-medium">{item.reality}</p>
            </div>
          </div>

          {/* Evidence */}
          <div className="bg-background/50 rounded-lg px-3 py-2">
            <p className="text-xs text-muted">
              <span className="text-muted/70">Evidence: </span>
              <span className="font-mono">{item.evidence}</span>
            </p>
          </div>

          {/* Footer */}
          <p className="text-xs text-muted/60 mt-2">
            Last verified: {new Date(item.lastChecked).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
