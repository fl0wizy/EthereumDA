"use client";

import { S1_SurvivalByAge, S2_SurvivalLatency, S3_SelfProbeE2E, S4_ClientDiversity } from "./_panels/safety";
import { L1_BlobsPerSlot, L2_FinalityLag, L3_BlobBasefee, L4_InclusionLatency } from "./_panels/liveness";
import { C1_CasperReadout, C2_SidecarPropagation } from "./_panels/cross";

function SectionTitle({ kind, title, hint }: { kind: "safety" | "liveness" | "cross"; title: string; hint?: string }) {
  const tone =
    kind === "safety"
      ? "text-accent-yellow border-accent-yellow/40"
      : kind === "liveness"
      ? "text-accent-blue border-accent-blue/40"
      : "text-accent-purple border-accent-purple/40";
  return (
    <div className="mb-4 mt-2">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className={`text-xs uppercase tracking-widest font-bold px-2 py-0.5 rounded border ${tone}`}>
          {kind}
        </span>
        <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      </div>
      {hint && <p className="text-sm text-muted mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

export default function EthDaSecurityPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2 tracking-tight">
          EthereumDA · Safety &amp; Liveness
        </h2>
        <p className="text-base text-muted max-w-3xl leading-relaxed">
          EigenDA spec 의 quorum-기반 safety / liveness threshold 정의에 대응하는
          Ethereum DA (EIP-4844 + Casper FFG) 의 관측값. 모든 패널은 로컬 collector
          (<code className="text-xs bg-card-bg px-1 rounded">eth_da</code> Postgres)
          를 30 초마다 폴링.
        </p>
      </div>

      {/* C1 — top: maps EigenDA vocabulary onto Ethereum's anchor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <C1_CasperReadout />
      </div>

      <div>
        <SectionTitle
          kind="safety"
          title="Safety — attestation 이 “data 가 실제로 존재함” 을 함의하는가"
          hint="EigenDA 의 safety threshold (% stake) 와 달리, Ethereum 은 “retention window 안에서 retrieve 되는가” 가 그 의미."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <S1_SurvivalByAge />
          <S2_SurvivalLatency />
          <S3_SelfProbeE2E />
          <S4_ClientDiversity />
        </div>
      </div>

      <div>
        <SectionTitle
          kind="liveness"
          title="Liveness — system 이 attestation 을 만들어내고 있는가"
          hint="blob 이 인클루전되고 finality 가 진행되는지. Casper liveness threshold (⅓ 오프라인 = halt) 와 fee market 압박 둘 다."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <L1_BlobsPerSlot />
          <L2_FinalityLag />
          <L3_BlobBasefee />
          <L4_InclusionLatency />
        </div>
      </div>

      <div>
        <SectionTitle
          kind="cross"
          title="Cross-cutting — 두 축 모두 영향"
          hint="gossip 전파 지연은 safety (sidecar 가 늦으면 attest 못 받음) 와 liveness (head 가 안 잡힘) 양쪽의 leading indicator."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <C2_SidecarPropagation />
        </div>
      </div>

      <div className="text-xs text-muted border-t border-card-border pt-4 leading-relaxed">
        ⓘ source: <code>/api/eth-da/security?type=…</code> · DB: <code>eth_da</code> @ 127.0.0.1:5432 ·
        collector: <code>~/eth-da-collector</code> · 자세한 매핑은
        EigenDA spec “Security Model” 절과 비교.
      </div>
    </div>
  );
}
