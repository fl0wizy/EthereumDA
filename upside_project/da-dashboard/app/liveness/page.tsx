"use client";

import { DATabs, DAPanel } from "../components/DATabs";
import SurvivalCurve from "../components/SurvivalCurve";
import LatencyChart from "../components/LatencyChart";
import {
  daInfo,
  daStatuses,
  integritySignals,
  survivalCurveData,
} from "../data/mock";
import type { DALayer } from "../data/mock";

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn" | "critical";
}) {
  const toneCls =
    tone === "critical"
      ? "text-accent-red"
      : tone === "warn"
      ? "text-accent-yellow"
      : tone === "ok"
      ? "text-accent-green"
      : "";
  return (
    <div className="border border-card-border rounded-lg p-4 bg-card-bg/40">
      <div className="text-xs uppercase tracking-wider text-muted mb-2">{label}</div>
      <div className={`text-2xl font-bold font-mono leading-tight ${toneCls}`}>{value}</div>
      {sub && <div className="text-sm text-muted mt-1.5 leading-relaxed">{sub}</div>}
    </div>
  );
}

function LivenessStats({ da }: { da: DALayer }) {
  const s = daStatuses.find((x) => x.id === da)!;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatTile
        label="Read 성공률 24h"
        value={`${s.retrievalSuccess24h}%`}
        tone={
          s.retrievalSuccess24h >= 99.5
            ? "ok"
            : s.retrievalSuccess24h >= 98
            ? "warn"
            : "critical"
        }
        sub="실측 retrieve 성공 비율"
      />
      <StatTile
        label="Submit p50"
        value={`${(s.submitLatencyP50 / 1000).toFixed(1)}s`}
        sub={`p95 ${(s.submitLatencyP95 / 1000).toFixed(1)}s`}
      />
      <StatTile
        label="30d 생존율"
        value={s.blobSurvival30d != null ? `${s.blobSurvival30d}%` : "Pruned"}
        tone={
          s.blobSurvival30d == null
            ? undefined
            : s.blobSurvival30d >= 99
            ? "ok"
            : s.blobSurvival30d >= 95
            ? "warn"
            : "critical"
        }
        sub={s.blobSurvival30d == null ? "EthereumDA는 18일 후 prune (정상)" : "30일 시점 retrieval 성공률"}
      />
      <StatTile
        label="Uptime 7d"
        value={`${s.uptimeLast7d}%`}
        tone={s.uptimeLast7d >= 99.5 ? "ok" : s.uptimeLast7d >= 98 ? "warn" : "critical"}
        sub="노드 + RPC 응답 가용성"
      />
    </div>
  );
}

function IntegritySection({ da }: { da: DALayer }) {
  const s = integritySignals.find((x) => x.da === da)!;
  const kzgOk = s.kzgMatchRate >= 99.95;
  const freeRiderOk = s.freeRiderCandidates === 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="border border-card-border rounded-lg p-5 bg-card-bg/40">
        <div className="text-xs uppercase tracking-wider text-muted mb-2">KZG 재계산 일치율</div>
        <div className={`text-3xl font-bold font-mono mb-2 ${kzgOk ? "" : "text-accent-yellow"}`}>
          {s.kzgMatchRate}%
        </div>
        <p className="text-sm text-muted leading-relaxed">
          24시간 {s.kzgChecks24h.toLocaleString()}회 검사 · retrieval 시 commitment 재계산해 원본과 비교
        </p>
      </div>

      <div className="border border-card-border rounded-lg p-5 bg-card-bg/40">
        <div className="text-xs uppercase tracking-wider text-muted mb-2">Free-rider 후보</div>
        <div
          className={`text-3xl font-bold font-mono mb-2 ${
            freeRiderOk ? "" : "text-accent-yellow"
          }`}
        >
          {s.freeRiderCandidates}
          {s.freeRiderTotal > 0 && (
            <span className="text-base text-muted ml-1">/ {s.freeRiderTotal}</span>
          )}
        </div>
        <p className="text-sm text-muted leading-relaxed">
          서명은 했지만 GetChunks 50%+ 실패 — 저장 없이 서명만 하는 operator 추정
        </p>
      </div>

      <div className="border border-card-border rounded-lg p-5 bg-card-bg/40">
        <div className="text-xs uppercase tracking-wider text-muted mb-2">Tenant Δp95</div>
        <div className="text-3xl font-bold font-mono mb-2">{s.tenantP95SpreadMs}ms</div>
        <p className="text-sm text-muted leading-relaxed">
          동일 size blob의 client별 p95 latency 스프레드 — 큰 값은 차별/우선순위화 신호
        </p>
      </div>

      <div className="md:col-span-3 text-sm text-muted leading-relaxed border-t border-card-border pt-4">
        {s.note}
      </div>
    </div>
  );
}

function SurvivalSummary({ da }: { da: DALayer }) {
  const d = daInfo[da];
  // Pull this DA's survival series only.
  const rows = survivalCurveData.map((p) => ({
    bucket: p.bucket,
    val: p[da],
  }));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="border border-card-border rounded-lg p-5 bg-card-bg/40">
        <div className="text-xs uppercase tracking-wider text-muted mb-3">Retention 정책 (스펙)</div>
        <div className="text-lg font-semibold leading-relaxed">{d.retentionPolicy}</div>
      </div>
      <div className="border border-card-border rounded-lg p-5 bg-card-bg/40">
        <div className="text-xs uppercase tracking-wider text-muted mb-3">Age bucket별 실측</div>
        <div className="grid grid-cols-3 gap-2 text-sm font-mono">
          {rows.map((r) => (
            <div key={r.bucket} className="flex justify-between border-b border-card-border/60 py-1">
              <span className="text-muted">{r.bucket}</span>
              <span>{r.val == null ? "prune" : `${r.val}%`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LivenessPanel({ da }: { da: DALayer }) {
  return (
    <DAPanel da={da}>
      <div className="mb-8">
        <SectionTitle title="라이브니스 요약" hint="제출과 retrieval이 지금 작동하는가" />
        <LivenessStats da={da} />
      </div>

      <div className="mb-8">
        <SectionTitle title="Retention · 시간 경과별 생존율" />
        <SurvivalSummary da={da} />
        <div className="mt-4">
          <SurvivalCurve daFilter={da} />
        </div>
      </div>

      <div className="mb-8">
        <SectionTitle title="Integrity" hint="정직하게 다루는가 — KZG, free-rider, tenant 차별" />
        <IntegritySection da={da} />
      </div>

      <div>
        <SectionTitle title="Submit Latency 24h" />
        <LatencyChart daFilter={da} />
      </div>
    </DAPanel>
  );
}

export default function LivenessPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 tracking-tight">Liveness</h2>
        <p className="text-base text-muted max-w-3xl leading-relaxed">
          내 데이터가 지금 살아있는가, 그리고 정직하게 다뤄지는가. 각 DA마다 submit·retrieval 성공률,
          시간 경과에 따른 생존 곡선, KZG 재계산 일치율과 free-rider 후보, 그리고 tenant별 latency
          스프레드를 같은 잣대로 본다.
        </p>
      </div>

      <DATabs>{(active) => <LivenessPanel da={active} />}</DATabs>
    </div>
  );
}
