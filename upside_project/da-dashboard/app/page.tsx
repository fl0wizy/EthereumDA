"use client";

import { DATabs, DAPanel } from "./components/DATabs";
import { daInfo } from "./data/mock";
import type { DAInfo, DALayer } from "./data/mock";

function StatGrid({ d }: { d: DAInfo }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Stat
        label="경제 보안"
        value={d.economicSecurity}
        sub={d.economicSecurityNote}
      />
      <Stat
        label="운영자"
        value={d.operatorCount}
        sub={d.operatorKind}
      />
      <Stat
        label="활성 롤업"
        value={d.activeRollups.slice(0, 3).join(", ")}
        sub={
          d.rollupCountTotal
            ? `외 ${Math.max(0, d.rollupCountTotal - 3)}개 · 총 ~${d.rollupCountTotal}개`
            : undefined
        }
      />
      <Stat label="처리량" value={d.throughput} sub={d.retentionPolicy} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-card-border rounded-lg p-4 bg-card-bg/40">
      <div className="text-xs uppercase tracking-wider text-muted mb-2">{label}</div>
      <div className="text-lg font-semibold leading-snug">{value}</div>
      {sub && <div className="text-sm text-muted mt-1.5 leading-relaxed">{sub}</div>}
    </div>
  );
}

function ConsensusRow({ d }: { d: DAInfo }) {
  return (
    <div className="mt-5 text-sm text-muted">
      <span>합의 / 임계값: </span>
      <span className="text-foreground font-mono">{d.consensusModel}</span>
    </div>
  );
}

function BondaOnlyBlock({ d }: { d: DAInfo }) {
  return (
    <div className="mt-6 border-t border-card-border pt-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-accent-blue/15 text-accent-blue border border-accent-blue/30">
          BONDA 단독
        </span>
        <span className="text-sm text-muted">
          이 DA 한정으로 다른 explorer에서는 볼 수 없는 지표
        </span>
      </div>
      <ul className="space-y-2">
        {d.bondaOnlyHighlights.map((h, i) => (
          <li key={i} className="flex items-start gap-3 text-base leading-relaxed">
            <span className="text-accent-blue shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-blue" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OverviewPanel({ da }: { da: DALayer }) {
  const d = daInfo[da];
  return (
    <DAPanel da={da}>
      <StatGrid d={d} />
      <ConsensusRow d={d} />
      <BondaOnlyBlock d={d} />
    </DAPanel>
  );
}

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 tracking-tight">Overview</h2>
        <p className="text-base text-muted max-w-3xl leading-relaxed">
          4개 DA 레이어를 동일한 잣대로 본다. 각 DA가 무엇인지, 어떻게 보호되는지, 누가 쓰는지,
          그리고 BONDA가 단독으로 보여주는 차별점을 다룬다. 실측 라이브니스·스펙 차이·위협 모델링은
          각 전용 페이지를 참고.
        </p>
      </div>

      <DATabs>{(active) => <OverviewPanel da={active} />}</DATabs>
    </div>
  );
}
