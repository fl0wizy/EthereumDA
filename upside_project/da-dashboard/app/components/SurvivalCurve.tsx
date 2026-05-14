"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { survivalCurveData } from "../data/mock";

const daLines = [
  { key: "ethereumda", name: "EthereumDA", color: "#627eea" },
  { key: "eigenda", name: "EigenDA", color: "#7c3aed" },
  { key: "celestia", name: "Celestia", color: "#8b5cf6" },
  { key: "avail", name: "Avail", color: "#06b6d4" },
] as const;

export default function SurvivalCurve() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-6">
      <div className="mb-6">
        <h2 className="text-lg font-bold">Blob Survival Curve</h2>
        <p className="text-sm text-muted mt-1">
          Retrieval success rate by age — how long does submitted data actually remain retrievable?
        </p>
      </div>
      <div className="overflow-x-auto">
        {mounted ? (
          <LineChart width={580} height={360} data={survivalCurveData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="bucket" stroke="#64748b" fontSize={12} tickLine={false} />
            <YAxis domain={[80, 100]} stroke="#64748b" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 8, fontSize: 13 }}
              formatter={(value) =>
                value !== null && value !== undefined ? [`${Number(value).toFixed(1)}%`, ""] : ["Pruned", ""]
              }
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
            {daLines.map((da) => (
              <Line
                key={da.key}
                type="monotone"
                dataKey={da.key}
                name={da.name}
                stroke={da.color}
                strokeWidth={2.5}
                dot={{ r: 4, fill: da.color }}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        ) : (
          <div className="h-[360px] flex items-center justify-center text-muted text-sm">Loading chart...</div>
        )}
      </div>
      <div className="mt-4 p-3 rounded-lg bg-accent-red/5 border border-accent-red/20">
        <p className="text-xs text-accent-red font-medium">
          EigenDA blob survival drops to 87.3% at 30d — data loss risk detected.
          EthereumDA blobs are pruned after ~18 days by design.
        </p>
      </div>
    </div>
  );
}
