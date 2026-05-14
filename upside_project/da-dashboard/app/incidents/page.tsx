"use client";

import { useState } from "react";
import IncidentTimeline from "../components/IncidentTimeline";
import { incidents } from "../data/mock";
import type { DALayer } from "../data/mock";

type Filter = "all" | DALayer;

export default function IncidentsPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered =
    filter === "all"
      ? incidents
      : incidents.filter((inc) => inc.da === filter);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: incidents.length },
    { key: "eigenda", label: "EigenDA", count: incidents.filter((i) => i.da === "eigenda").length },
    { key: "avail", label: "Avail", count: incidents.filter((i) => i.da === "avail").length },
    { key: "celestia", label: "Celestia", count: incidents.filter((i) => i.da === "celestia").length },
    { key: "ethereumda", label: "EthereumDA", count: incidents.filter((i) => i.da === "ethereumda").length },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-1">Incidents</h2>
        <p className="text-sm text-muted">
          Auto-detected anomalies from probe data — submit failures, retrieval errors, latency spikes, and peer drops
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card-bg border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold">{incidents.length}</div>
          <div className="text-xs text-muted mt-1">Total (7d)</div>
        </div>
        <div className="bg-card-bg border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-accent-green">
            {incidents.filter((i) => i.resolved).length}
          </div>
          <div className="text-xs text-muted mt-1">Resolved</div>
        </div>
        <div className="bg-card-bg border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-accent-red">
            {incidents.filter((i) => !i.resolved).length}
          </div>
          <div className="text-xs text-muted mt-1">Active</div>
        </div>
        <div className="bg-card-bg border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-accent-yellow">
            {incidents.filter((i) => i.type === "latency_spike").length}
          </div>
          <div className="text-xs text-muted mt-1">Latency Spikes</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
              filter === f.key
                ? "bg-accent-blue/20 text-accent-blue font-medium"
                : "text-muted hover:text-foreground"
            }`}
          >
            {f.label}
            <span className="text-xs opacity-60">({f.count})</span>
          </button>
        ))}
      </div>

      <IncidentTimeline incidents={filtered} />
    </div>
  );
}
