"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { latencyData } from "../data/mock";

export default function LatencyChart() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-6">
      <div className="mb-6">
        <h2 className="text-lg font-bold">Submit Latency (24h)</h2>
        <p className="text-sm text-muted mt-1">
          Time from blob submit request to confirmation — measured from our probe nodes
        </p>
      </div>
      <div className="overflow-x-auto">
        {mounted ? (
          <AreaChart width={580} height={300} data={latencyData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}s`} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
              formatter={(value) => [`${(Number(value) / 1000).toFixed(1)}s`, ""]}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Area type="monotone" dataKey="ethereumda" name="EthereumDA" stroke="#627eea" fill="#627eea" fillOpacity={0.1} strokeWidth={2} />
            <Area type="monotone" dataKey="eigenda" name="EigenDA" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.1} strokeWidth={2} />
            <Area type="monotone" dataKey="celestia" name="Celestia" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} strokeWidth={2} />
            <Area type="monotone" dataKey="avail" name="Avail" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted text-sm">Loading chart...</div>
        )}
      </div>
    </div>
  );
}
