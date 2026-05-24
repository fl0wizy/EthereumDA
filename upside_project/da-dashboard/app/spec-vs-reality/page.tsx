"use client";

import { DATabs, DAPanel } from "../components/DATabs";
import SpecVsRealityCard from "../components/SpecVsRealityCard";
import RelayStatus from "../components/RelayStatus";
import { specVsRealityData } from "../data/mock";
import type { DALayer } from "../data/mock";

function SeverityChip({ count, kind }: { count: number; kind: "critical" | "warning" | "info" }) {
  const map = {
    critical: "text-accent-red bg-accent-red/10 border-accent-red/40",
    warning: "text-accent-yellow bg-accent-yellow/10 border-accent-yellow/40",
    info: "text-accent-blue bg-accent-blue/10 border-accent-blue/40",
  } as const;
  const label = { critical: "Critical", warning: "Warning", info: "Info" }[kind];
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-md border text-sm font-medium ${map[kind]}`}>
      <span className="font-mono font-bold">{count}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}

function SpecPanel({ da }: { da: DALayer }) {
  const findings = specVsRealityData.filter((s) => s.da === da);

  // Sort: critical → warning → info
  const order = { critical: 0, warning: 1, info: 2 } as const;
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);

  const c = findings.filter((f) => f.severity === "critical").length;
  const w = findings.filter((f) => f.severity === "warning").length;
  const i = findings.filter((f) => f.severity === "info").length;

  const rightSlot = (
    <div className="flex flex-wrap gap-2 justify-end">
      {c > 0 && <SeverityChip count={c} kind="critical" />}
      {w > 0 && <SeverityChip count={w} kind="warning" />}
      {i > 0 && <SeverityChip count={i} kind="info" />}
      {findings.length === 0 && (
        <span className="text-sm text-muted">발견된 차이 없음</span>
      )}
    </div>
  );

  return (
    <DAPanel da={da} rightSlot={rightSlot}>
      {/* EigenDA에는 relay registry 라이브 상태를 헤드라인으로 — 본 페이지의 대표 발견. */}
      {da === "eigenda" && (
        <div className="mb-6">
          <RelayStatus />
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-card-border bg-card-bg/40 p-10 text-center text-base text-muted">
          이 DA에 대해 현재 트래킹 중인 스펙↔현실 차이가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((item, i) => (
            <SpecVsRealityCard key={i} item={item} />
          ))}
        </div>
      )}
    </DAPanel>
  );
}

export default function SpecVsRealityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 tracking-tight">Spec vs Reality</h2>
        <p className="text-base text-muted max-w-3xl leading-relaxed">
          DA 백서·문서가 약속한 것과, BONDA가 실제 체인·노드에서 관측한 것의 차이. 각 카드는
          스펙·현실·증거·마지막 검증 시각을 함께 보여준다. 가장 큰 발견은 EigenDA의 relay registry
          상태로, 단일 active relay만이 등록되어 있다.
        </p>
      </div>

      <DATabs>{(active) => <SpecPanel da={active} />}</DATabs>
    </div>
  );
}
