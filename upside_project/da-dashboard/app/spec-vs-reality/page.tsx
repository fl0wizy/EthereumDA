"use client";

import { useState } from "react";
import SpecVsRealityCard from "../components/SpecVsRealityCard";
import RelayStatus from "../components/RelayStatus";
import { specVsRealityData } from "../data/mock";
import type { DALayer } from "../data/mock";

type Filter = "all" | DALayer;

const filters: { key: Filter; label: string; color: string }[] = [
  { key: "all", label: "All", color: "#64748b" },
  { key: "ethereumda", label: "EthereumDA", color: "#627eea" },
  { key: "eigenda", label: "EigenDA", color: "#7c3aed" },
  { key: "celestia", label: "Celestia", color: "#8b5cf6" },
  { key: "avail", label: "Avail", color: "#06b6d4" },
];

export default function SpecVsRealityPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered =
    filter === "all"
      ? specVsRealityData
      : specVsRealityData.filter((item) => item.da === filter);

  const criticalCount = specVsRealityData.filter((i) => i.severity === "critical").length;
  const warningCount = specVsRealityData.filter((i) => i.severity === "warning").length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-1">Spec vs Reality</h2>
        <p className="text-sm text-muted">
          Discrepancies between DA layer documentation/whitepapers and observed on-chain behavior
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <div className="bg-accent-red/10 border border-accent-red/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-accent-red">{criticalCount}</div>
          <div className="text-xs text-muted mt-1">Critical</div>
        </div>
        <div className="bg-accent-yellow/10 border border-accent-yellow/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-accent-yellow">{warningCount}</div>
          <div className="text-xs text-muted mt-1">Warning</div>
        </div>
        <div className="bg-accent-blue/10 border border-accent-blue/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-accent-blue">{specVsRealityData.length}</div>
          <div className="text-xs text-muted mt-1">Total Findings</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? "text-white"
                : "text-muted hover:text-foreground"
            }`}
            style={
              filter === f.key
                ? { backgroundColor: `${f.color}30`, color: f.color }
                : undefined
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {filtered.map((item, i) => (
          <SpecVsRealityCard key={i} item={item} />
        ))}
      </div>

      {/* EigenDA Deep Dive */}
      {(filter === "all" || filter === "eigenda") && (
        <div className="pt-4">
          <h3 className="text-lg font-bold mb-4">EigenDA Relay Deep Dive</h3>
          <RelayStatus />
        </div>
      )}
    </div>
  );
}
