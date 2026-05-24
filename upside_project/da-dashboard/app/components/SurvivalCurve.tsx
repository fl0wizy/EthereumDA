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
import { survivalCurveData, daInfo } from "../data/mock";
import type { DALayer } from "../data/mock";

const ALL_DA: { key: DALayer; name: string; color: string }[] = [
  { key: "ethereumda", name: "EthereumDA", color: "#627eea" },
  { key: "eigenda", name: "EigenDA", color: "#7c3aed" },
  { key: "celestia", name: "Celestia", color: "#8b5cf6" },
  { key: "avail", name: "Avail", color: "#06b6d4" },
];

export default function SurvivalCurve({ daFilter }: { daFilter?: DALayer }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lines = daFilter ? ALL_DA.filter((d) => d.key === daFilter) : ALL_DA;
  const headerName = daFilter ? daInfo[daFilter].name : "전체 DA";

  return (
    <div className="bg-card-bg border border-card-border rounded-xl p-6">
      <div className="mb-6">
        <h3 className="text-lg font-bold">Blob Survival Curve · {headerName}</h3>
        <p className="text-sm text-muted mt-1 leading-relaxed">
          제출된 데이터가 시간이 지나도 retrieval 가능한지 — age bucket별 성공률
        </p>
      </div>
      <div className="overflow-x-auto">
        {mounted ? (
          <LineChart
            width={620}
            height={340}
            data={survivalCurveData}
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a30" />
            <XAxis dataKey="bucket" stroke="#9ca3af" fontSize={13} tickLine={false} />
            <YAxis
              domain={[80, 100]}
              stroke="#9ca3af"
              fontSize={13}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: "#131316", border: "1px solid #2a2a30", borderRadius: 8, fontSize: 14 }}
              formatter={(value) =>
                value !== null && value !== undefined
                  ? [`${Number(value).toFixed(1)}%`, ""]
                  : ["Pruned", ""]
              }
            />
            <Legend wrapperStyle={{ fontSize: 14, paddingTop: 12 }} />
            {lines.map((da) => (
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
          <div className="h-[340px] flex items-center justify-center text-muted text-sm">
            차트 로딩 중…
          </div>
        )}
      </div>
    </div>
  );
}
