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
import { latencyData, daInfo } from "../data/mock";
import type { DALayer } from "../data/mock";

const ALL_DA: { key: DALayer; name: string; color: string }[] = [
  { key: "ethereumda", name: "EthereumDA", color: "#627eea" },
  { key: "eigenda", name: "EigenDA", color: "#7c3aed" },
  { key: "celestia", name: "Celestia", color: "#8b5cf6" },
  { key: "avail", name: "Avail", color: "#06b6d4" },
];

export default function LatencyChart({ daFilter }: { daFilter?: DALayer }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const series = daFilter ? ALL_DA.filter((d) => d.key === daFilter) : ALL_DA;
  const headerName = daFilter ? daInfo[daFilter].name : "전체 DA";

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-6">
      <div className="mb-6">
        <h3 className="text-lg font-bold">Submit Latency 24h · {headerName}</h3>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          Blob 제출 요청부터 confirmation 까지 — BONDA probe 노드 기준
        </p>
      </div>
      <div className="overflow-x-auto">
        {mounted ? (
          <AreaChart
            width={620}
            height={280}
            data={latencyData}
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a30" />
            <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} tickLine={false} />
            <YAxis
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}s`}
            />
            <Tooltip
              contentStyle={{ background: "#131316", border: "1px solid #2a2a30", borderRadius: 8, fontSize: 13 }}
              formatter={(value) => [`${(Number(value) / 1000).toFixed(1)}s`, ""]}
            />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
            {series.map((da) => (
              <Area
                key={da.key}
                type="monotone"
                dataKey={da.key}
                name={da.name}
                stroke={da.color}
                fill={da.color}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-muted text-sm">
            차트 로딩 중…
          </div>
        )}
      </div>
    </div>
  );
}
