"use client";

import type { Incident } from "../data/mock";

const typeLabels: Record<Incident["type"], { label: string; color: string }> = {
  submit_failure: { label: "Submit Failure", color: "bg-accent-red/20 text-accent-red" },
  retrieval_failure: { label: "Retrieval Failure", color: "bg-accent-red/20 text-accent-red" },
  sync_lag: { label: "Sync Lag", color: "bg-accent-yellow/20 text-accent-yellow" },
  peers_drop: { label: "Peers Drop", color: "bg-accent-yellow/20 text-accent-yellow" },
  latency_spike: { label: "Latency Spike", color: "bg-accent-purple/20 text-accent-purple" },
};

const daColors: Record<string, string> = {
  eigenda: "#7c3aed",
  ethereumda: "#627eea",
  celestia: "#8b5cf6",
  avail: "#06b6d4",
};

export default function IncidentTimeline({ incidents }: { incidents: Incident[] }) {
  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-6">
      <div className="mb-6">
        <h2 className="text-lg font-bold">Incident Timeline</h2>
        <p className="text-sm text-muted mt-1">
          Anomalies detected from probe data — auto-detected submit failures, retrieval errors, and latency spikes
        </p>
      </div>

      <div className="space-y-1">
        {incidents.map((inc, i) => (
          <div key={inc.id} className="flex gap-4">
            {/* Timeline line */}
            <div className="flex flex-col items-center w-6 shrink-0">
              <div
                className="w-3 h-3 rounded-full border-2 mt-1.5"
                style={{ borderColor: daColors[inc.da], backgroundColor: `${daColors[inc.da]}30` }}
              />
              {i < incidents.length - 1 && (
                <div className="w-px flex-1 bg-card-border" />
              )}
            </div>

            {/* Content */}
            <div className="pb-6 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: `${daColors[inc.da]}20`,
                    color: daColors[inc.da],
                  }}
                >
                  {inc.daName}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${typeLabels[inc.type].color}`}>
                  {typeLabels[inc.type].label}
                </span>
                <span className="text-xs text-muted ml-auto">
                  {new Date(inc.timestamp).toLocaleString()}
                </span>
              </div>
              <h4 className="text-sm font-semibold mb-1">{inc.title}</h4>
              <p className="text-xs text-muted leading-relaxed">{inc.description}</p>
              <div className="flex gap-3 mt-2 text-xs text-muted">
                <span>Duration: {inc.duration}</span>
                <span className={inc.resolved ? "text-accent-green" : "text-accent-red"}>
                  {inc.resolved ? "Resolved" : "Active"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
