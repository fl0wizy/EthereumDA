"use client";

import SurvivalCurve from "../components/SurvivalCurve";
import LatencyChart from "../components/LatencyChart";
import { survivalCurveData } from "../data/mock";

function RetrievalHeatmap() {
  const buckets = ["5m", "15m", "1h", "6h", "1d", "3d", "7d", "14d", "30d"];
  const probes = Array.from({ length: 12 }, (_, i) => `Probe #${(i + 1).toString().padStart(3, "0")}`);

  const getColor = (bucket: string, probeIdx: number): string => {
    // Simulate: most succeed, some fail at longer buckets
    const bucketIdx = buckets.indexOf(bucket);
    const failChance = (bucketIdx / 8) * 0.15 + (probeIdx % 5 === 0 ? 0.1 : 0);
    const seed = (bucketIdx * 17 + probeIdx * 31) % 100;
    if (seed / 100 < failChance) return "bg-accent-red/60";
    if (seed / 100 < failChance + 0.05) return "bg-accent-yellow/50";
    return "bg-accent-green/50";
  };

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold">Retrieval Heatmap</h2>
        <p className="text-sm text-muted mt-1">
          Each cell = one probe&apos;s retrieval result at a given age bucket. Green = success, Red = failure, Yellow = slow.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-muted pb-2 pr-3 w-24">Probe</th>
              {buckets.map((b) => (
                <th key={b} className="text-center text-muted pb-2 px-1 w-12">{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {probes.map((probe, pi) => (
              <tr key={probe}>
                <td className="text-muted py-0.5 pr-3 font-mono">{probe}</td>
                {buckets.map((bucket) => (
                  <td key={bucket} className="px-0.5 py-0.5">
                    <div className={`w-full h-5 rounded-sm ${getColor(bucket, pi)}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 mt-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-accent-green/50" /> Success
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-accent-yellow/50" /> Slow (&gt;5s)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-accent-red/60" /> Failed
        </span>
      </div>
    </div>
  );
}

function SurvivalStats() {
  const das = [
    { name: "EthereumDA", color: "#627eea", retention: "~18 days (pruned by design)", survival30d: "N/A" },
    { name: "EigenDA", color: "#7c3aed", retention: "14 days (claimed)", survival30d: "87.3%" },
    { name: "Celestia", color: "#8b5cf6", retention: "30 days", survival30d: "99.8%" },
    { name: "Avail", color: "#06b6d4", retention: "30 days", survival30d: "96.4%" },
  ];

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-6">
      <h2 className="text-lg font-bold mb-4">Retention Summary</h2>
      <div className="space-y-3">
        {das.map((da) => (
          <div key={da.name} className="flex items-center gap-4 py-2 border-b border-card-border last:border-0">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: da.color }} />
            <div className="flex-1">
              <div className="flex justify-between">
                <span className="text-sm font-medium">{da.name}</span>
                <span className="text-sm font-mono">{da.survival30d}</span>
              </div>
              <p className="text-xs text-muted">Claimed retention: {da.retention}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SurvivalPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-1">Blob Lifecycle</h2>
        <p className="text-sm text-muted">
          End-to-end blob lifecycle tracking — from submit to long-term retrievability verification
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <SurvivalCurve />
        </div>
        <SurvivalStats />
      </div>

      <RetrievalHeatmap />
      <LatencyChart />
    </div>
  );
}
