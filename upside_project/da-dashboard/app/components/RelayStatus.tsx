"use client";

import { relayRegistry } from "../data/mock";

export default function RelayStatus() {
  const activeCount = relayRegistry.filter((r) => r.isActive).length;
  const totalCount = relayRegistry.length;

  return (
    <div className="bg-card-bg border border-accent-red/30 rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold">EigenDA Relay Registry</h2>
          <p className="text-sm text-muted mt-0.5">On-chain relay status from relay_registry contract</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono">
            <span className="text-accent-red">{activeCount}</span>
            <span className="text-muted">/{totalCount}</span>
          </div>
          <p className="text-xs text-accent-red">active relays</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {relayRegistry.map((relay) => (
          <div
            key={relay.index}
            className={`rounded-lg p-4 border text-center ${
              relay.isActive
                ? "border-accent-green/30 bg-accent-green/5"
                : "border-accent-red/20 bg-accent-red/5"
            }`}
          >
            <p className="text-xs text-muted mb-1">Relay {relay.index}</p>
            <p className="font-mono text-sm mb-2 truncate">{relay.key}</p>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                relay.isActive
                  ? "bg-accent-green/20 text-accent-green"
                  : "bg-accent-red/20 text-accent-red"
              }`}
            >
              {relay.isActive ? "ACTIVE" : "EMPTY (0x0)"}
            </span>
            {relay.lastSeen && (
              <p className="text-xs text-muted mt-2">
                Last seen: {new Date(relay.lastSeen).toLocaleTimeString()}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-accent-red/5 border border-accent-red/20 p-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-accent-red shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-accent-red">Single Point of Failure Detected</p>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              The EigenDA whitepaper states that &quot;multiple relays prevent centralization,&quot; but only 1 of 3
              registered relay keys is non-zero. If this single relay goes down, the entire EigenDA
              network becomes unavailable. Combined with a global (not per-client) rate limit,
              this creates a viable DoS attack vector.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
