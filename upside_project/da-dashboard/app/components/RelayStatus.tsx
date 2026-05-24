"use client";

import { relayRegistry } from "../data/mock";

export default function RelayStatus() {
  const activeCount = relayRegistry.filter((r) => r.isActive).length;
  const totalCount = relayRegistry.length;

  return (
    <div className="bg-card-bg border border-accent-red/30 rounded-xl p-6">
      <header className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h3 className="text-xl font-bold">EigenDA Relay Registry</h3>
          <p className="text-sm text-muted mt-1 leading-relaxed">
            relay_registry 컨트랙트의 슬롯 상태 — 온체인 폴링 결과
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold font-mono">
            <span className="text-accent-red">{activeCount}</span>
            <span className="text-muted">/{totalCount}</span>
          </div>
          <p className="text-sm text-accent-red mt-1">active relay</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {relayRegistry.map((relay) => (
          <div
            key={relay.index}
            className={`rounded-lg p-4 border ${
              relay.isActive
                ? "border-accent-green/40 bg-accent-green/5"
                : "border-accent-red/30 bg-accent-red/5"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">슬롯 {relay.index}</span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                  relay.isActive
                    ? "bg-accent-green/20 text-accent-green"
                    : "bg-accent-red/20 text-accent-red"
                }`}
              >
                {relay.isActive ? "ACTIVE" : "EMPTY · 0x0"}
              </span>
            </div>
            <p className="font-mono text-sm break-all">{relay.key}</p>
            {relay.lastSeen && (
              <p className="text-xs text-muted mt-2">
                마지막 응답:{" "}
                {new Date(relay.lastSeen).toLocaleTimeString("ko-KR", {
                  timeZone: "UTC",
                })}{" "}
                UTC
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-accent-red/5 border border-accent-red/30 p-4">
        <div className="flex gap-3">
          <svg
            className="w-5 h-5 text-accent-red shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-base font-bold text-accent-red">Single Point of Failure 확정</p>
            <p className="text-sm text-foreground/80 mt-1.5 leading-relaxed">
              EigenDA 백서는 &ldquo;다수 relay가 중앙화를 방지한다&rdquo;고 명시하지만, 등록된 3개 슬롯 중 실제 키를 가진 것은 1개뿐이고
              나머지 2개는 0x0이다. 이 active relay가 다운되면 EigenDA의 read 경로 전체가 멈춘다. server-wide
              rate limit과 결합하면 단일 클라이언트의 DoS만으로도 같은 결과를 만들 수 있다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
