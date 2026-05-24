"use client";

import Image from "next/image";
import { DATabs, DAPanel } from "../components/DATabs";
import { daAssets, daDfdImage, daThreats, daThreatScenarios, safetyMargins } from "../data/mock";
import type { AssetEntry, DALayer, Threat, ThreatScenario } from "../data/mock";

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

function DfdBlock({ da }: { da: DALayer }) {
  const src = daDfdImage[da];
  return (
    <div className="mb-8">
      <SectionTitle title="데이터 흐름도 (DFD)" hint="자산이 어디서 흐르고, 어디서 변환되는지" />
      {src ? (
        <figure className="rounded-lg border border-card-border bg-[#f5f3ec] overflow-hidden">
          <Image
            src={src}
            alt={`${da} 데이터 흐름도`}
            width={1400}
            height={700}
            className="w-full h-auto"
            unoptimized
          />
          <figcaption className="px-4 py-2.5 text-xs text-muted bg-card-bg border-t border-card-border">
            ※ 현재는 L2Beat의 Casper finality 다이어그램을 mock으로 사용 중. 실제 DFD 업로드 시{" "}
            <code className="font-mono text-foreground/80">public/dfd/{da}.png</code> 로 교체.
          </figcaption>
        </figure>
      ) : (
        <div className="rounded-lg border border-dashed border-card-border bg-card-bg/40 p-10 text-center">
          <div className="text-base text-muted">
            DFD 미공개 — <code className="font-mono text-foreground/80">public/dfd/{da}.png</code> 에 이미지를 두고{" "}
            <code className="font-mono text-foreground/80">daDfdImage.{da}</code> 를 설정하세요.
          </div>
        </div>
      )}
    </div>
  );
}

function AssetTable({ assets }: { assets: AssetEntry[] }) {
  if (assets.length === 0) {
    return <div className="text-base text-muted italic">자산 분해 미작성.</div>;
  }
  return (
    <div className="overflow-x-auto -mx-1 rounded-lg border border-card-border">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-card-border bg-card-bg/60">
            <th className="font-medium px-4 py-3">자산</th>
            <th className="font-medium px-4 py-3">소유자 / 위치</th>
            <th className="font-medium px-4 py-3">신뢰 가정</th>
            <th className="font-medium px-4 py-3">실패 영향</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a, i) => (
            <tr key={i} className="border-b border-card-border/60 last:border-0 align-top text-base">
              <td className="px-4 py-3 font-semibold leading-relaxed">{a.asset}</td>
              <td className="px-4 py-3 text-muted leading-relaxed">{a.owner}</td>
              <td className="px-4 py-3 text-muted leading-relaxed">{a.trust}</td>
              <td className="px-4 py-3 text-muted leading-relaxed">{a.failureImpact}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpofPanel({ da }: { da: DALayer }) {
  const m = safetyMargins.find((s) => s.da === da);
  if (!m) return null;
  const max = Math.max(...safetyMargins.map((s) => s.spofScore));
  const tone =
    m.spofScore >= 70 ? "bg-accent-green" : m.spofScore >= 40 ? "bg-accent-yellow" : "bg-accent-red";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="border border-card-border rounded-lg p-5 bg-card-bg/40">
        <div className="text-xs uppercase tracking-wider text-muted mb-3">SPOF 점수</div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-4xl font-bold font-mono">{m.spofScore}</span>
          <span className="text-sm text-muted">/ 100</span>
        </div>
        <div className="h-2 rounded-full bg-card-border overflow-hidden">
          <div className={`h-full ${tone}`} style={{ width: `${(m.spofScore / max) * 100}%` }} />
        </div>
        {m.spofComponents.length > 0 ? (
          <div className="mt-4 text-sm">
            <div className="text-muted mb-1.5">식별된 SPOF 컴포넌트</div>
            <div className="font-mono text-accent-red leading-relaxed">
              {m.spofComponents.join(" · ")}
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-muted italic">단일 컴포넌트 장애만으로는 시스템이 정지하지 않음.</div>
        )}
      </div>

      <div className="border border-card-border rounded-lg p-5 bg-card-bg/40">
        <div className="text-xs uppercase tracking-wider text-muted mb-3">재구성 마진</div>
        <div
          className={`text-4xl font-bold font-mono mb-3 ${
            m.reconstructionMarginPct < 10 ? "text-accent-yellow" : ""
          }`}
        >
          +{m.reconstructionMarginPct} pts
        </div>
        <div className="text-sm text-muted leading-relaxed">
          임계값 <span className="text-foreground font-mono">{m.reconstructionThreshold}</span> 대비
          라이브 서명 stake 여유분.
        </div>
      </div>

      <div className="border border-card-border rounded-lg p-5 bg-card-bg/40">
        <div className="text-xs uppercase tracking-wider text-muted mb-3">Stake 집중도</div>
        <div
          className={`text-4xl font-bold font-mono mb-3 ${
            m.topNShare > 50 ? "text-accent-yellow" : ""
          }`}
        >
          {m.topNShare}%
        </div>
        <div className="text-sm text-muted leading-relaxed">
          Top-5 비중 · Nakamoto 계수{" "}
          <span className="text-foreground font-mono">{m.topNakamotoCoefficient}</span>
        </div>
      </div>
    </div>
  );
}

function ThreatCard({ t }: { t: Threat }) {
  const tone: Record<string, { border: string; text: string; label: string }> = {
    ok: { border: "border-l-accent-green", text: "text-accent-green", label: "정상" },
    warn: { border: "border-l-accent-yellow", text: "text-accent-yellow", label: "주의" },
    critical: { border: "border-l-accent-red", text: "text-accent-red", label: "심각" },
  };
  const s = tone[t.status];
  return (
    <div className={`border border-card-border border-l-4 ${s.border} bg-card-bg/40 rounded-lg p-5`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="text-lg font-bold">{t.title}</h4>
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${s.text} border border-current`}>
          {s.label}
        </span>
      </div>
      <p className="text-base text-foreground/85 leading-relaxed">{t.description}</p>
      <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <div>
          <dt className="inline text-muted">현재: </dt>
          <dd className="inline font-mono">{t.indicator}</dd>
        </div>
        <div>
          <dt className="inline text-muted">트리거: </dt>
          <dd className="inline font-mono">{t.threshold}</dd>
        </div>
      </dl>
      <div className="mt-2 text-sm text-muted">
        <span className="opacity-70">증거: </span>
        {t.evidence}
      </div>
    </div>
  );
}

function ThreatList({ threats }: { threats: Threat[] }) {
  if (threats.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-card-border bg-card-bg/40 p-8 text-center text-base text-muted leading-relaxed">
        이 DA의 위협 모델링은 아직 정리되지 않았습니다. 위 자산 분해가 출발점이며, DFD가 공개되면
        위협 카드도 채워질 예정입니다.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {threats.map((t) => (
        <ThreatCard key={t.id} t={t} />
      ))}
    </div>
  );
}

function ScenarioBlock({ scenarios }: { scenarios: ThreatScenario[] }) {
  if (scenarios.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-card-border bg-card-bg/40 p-8 text-center text-base text-muted leading-relaxed">
        이 DA의 위협 시나리오 줄글은 아직 작성되지 않았습니다.
      </div>
    );
  }

  const tone: Record<ThreatScenario["severity"], { bar: string; chip: string; label: string }> = {
    info: { bar: "border-l-accent-blue", chip: "text-accent-blue border-accent-blue/40", label: "Info" },
    warning: {
      bar: "border-l-accent-yellow",
      chip: "text-accent-yellow border-accent-yellow/40",
      label: "Warning",
    },
    critical: {
      bar: "border-l-accent-red",
      chip: "text-accent-red border-accent-red/40",
      label: "Critical",
    },
  };

  return (
    <div className="space-y-5">
      {scenarios.map((sc) => {
        const t = tone[sc.severity];
        return (
          <article
            key={sc.id}
            className={`border border-card-border border-l-4 ${t.bar} bg-card-bg/60 rounded-lg p-6`}
          >
            <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h4 className="text-xl font-bold tracking-tight">{sc.title}</h4>
              <span
                className={`px-2.5 py-1 rounded text-xs font-bold uppercase border ${t.chip}`}
              >
                {t.label}
              </span>
            </header>
            <div className="space-y-3 text-base text-foreground/85 leading-[1.75]">
              {sc.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {sc.watchedBy && sc.watchedBy.length > 0 && (
              <div className="mt-5 pt-4 border-t border-card-border">
                <div className="text-xs uppercase tracking-wider text-muted mb-2">
                  BONDA가 감시하는 신호
                </div>
                <ul className="space-y-1.5">
                  {sc.watchedBy.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                      <span className="text-accent-blue mt-2 w-1.5 h-1.5 rounded-full bg-accent-blue shrink-0" />
                      <span className="text-foreground/85">{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ThreatPanel({ da }: { da: DALayer }) {
  const threats = daThreats[da];
  const scenarios = daThreatScenarios[da];
  const rightSlot = (
    <div className="text-right text-sm text-muted whitespace-nowrap leading-relaxed">
      <div>
        {scenarios.length > 0 ? `시나리오 ${scenarios.length}건` : "시나리오 미작성"}
      </div>
      <div>
        {threats.length > 0 ? `실시간 위협 지표 ${threats.length}건` : "실시간 지표 대기 중"}
      </div>
    </div>
  );

  return (
    <DAPanel da={da} rightSlot={rightSlot}>
      <DfdBlock da={da} />

      <div className="mb-8">
        <SectionTitle title="위협 시나리오" hint="스펙과 현실의 차이가 만드는 공격 표면 (줄글)" />
        <ScenarioBlock scenarios={scenarios} />
      </div>

      <div className="mb-8">
        <SectionTitle title="위험 자산" hint="누가 무엇을 들고 있고, 깨지면 어떻게 되는가" />
        <AssetTable assets={daAssets[da]} />
      </div>

      <div className="mb-8">
        <SectionTitle title="SPOF · 탈중앙화 마진" hint="갑자기 무너질 가능성?" />
        <SpofPanel da={da} />
      </div>

      <div>
        <SectionTitle title="위협 → 실시간 지표" hint="위협 모델과 라이브 지표 매핑" />
        <ThreatList threats={threats} />
      </div>
    </DAPanel>
  );
}

export default function ThreatModelingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 tracking-tight">Threat Modeling</h2>
        <p className="text-base text-muted max-w-3xl leading-relaxed">
          각 DA의 데이터 흐름도(DFD), 위험에 노출된 자산, 단일 장애점과 탈중앙화 마진, 그리고 위협
          시나리오와 그 실시간 지표 매핑을 한 화면에서 본다. 현재 EigenDA가 가장 깊게 모델링되어
          있고, 나머지는 DFD 공개 후 단계적으로 채워진다.
        </p>
      </div>

      <DATabs>{(active) => <ThreatPanel da={active} />}</DATabs>
    </div>
  );
}
