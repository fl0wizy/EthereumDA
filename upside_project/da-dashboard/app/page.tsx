"use client";

import StatusCard from "./components/StatusCard";
import SurvivalCurve from "./components/SurvivalCurve";
import LatencyChart from "./components/LatencyChart";
import RelayStatus from "./components/RelayStatus";
import { daStatuses } from "./data/mock";

export default function Home() {
  return (
    <div className="space-y-8">
      {/* Hero stats */}
      <div>
        <h2 className="text-2xl font-bold mb-1">Overview</h2>
        <p className="text-sm text-muted mb-6">
          Live health status across 4 DA layers — powered by self-hosted full nodes, light nodes, and active blob probing
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {daStatuses.map((da) => (
            <StatusCard key={da.id} da={da} />
          ))}
        </div>
      </div>

      {/* Key insight banner */}
      <div className="bg-gradient-to-r from-accent-red/10 to-accent-purple/10 border border-accent-red/20 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent-red/20 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-accent-red">Critical Finding: EigenDA Relay Centralization</h3>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              Despite the whitepaper claiming multiple relays prevent centralization, only <strong className="text-foreground">1 of 3</strong> registered
              relays has a non-zero key. The remaining 2 are 0x0. Combined with a <strong className="text-foreground">global rate limit</strong> (not
              per-client), a single DoS attack on the active relay could take down the entire network.
            </p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SurvivalCurve />
        <LatencyChart />
      </div>

      {/* EigenDA Relay Detail */}
      <RelayStatus />
    </div>
  );
}
