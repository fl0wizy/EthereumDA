"use client";

import { useState, type ReactNode } from "react";
import { daInfo } from "../data/mock";
import type { DALayer } from "../data/mock";

export const DA_ORDER: DALayer[] = ["ethereumda", "eigenda", "celestia", "avail"];

interface DATabsProps {
  defaultDa?: DALayer;
  children: (active: DALayer) => ReactNode;
}

export function DATabs({ defaultDa = "ethereumda", children }: DATabsProps) {
  const [active, setActive] = useState<DALayer>(defaultDa);
  return (
    <div className="space-y-6">
      <div role="tablist" className="flex flex-wrap gap-2 border-b border-card-border pb-1">
        {DA_ORDER.map((id) => {
          const d = daInfo[id];
          const isActive = active === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(id)}
              className={`relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-t-lg text-base font-semibold transition-colors ${
                isActive
                  ? "bg-card-bg text-foreground"
                  : "text-muted hover:text-foreground hover:bg-card-bg/40"
              }`}
              style={
                isActive
                  ? { boxShadow: `inset 0 -3px 0 0 ${d.color}` }
                  : undefined
              }
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              <span>{d.name}</span>
            </button>
          );
        })}
      </div>
      <div>{children(active)}</div>
    </div>
  );
}

/**
 * Per-DA content wrapper — colored header bar with name + tagline + mechanism,
 * then a body slot. No anchor scroll behavior; DATabs handles which DA is shown.
 */
export function DAPanel({
  da,
  children,
  rightSlot,
}: {
  da: DALayer;
  children: ReactNode;
  rightSlot?: ReactNode;
}) {
  const d = daInfo[da];
  return (
    <section
      className="bg-card-bg border border-card-border rounded-xl overflow-hidden"
      style={{ borderTopColor: d.color, borderTopWidth: "3px" }}
    >
      <header className="px-7 py-5 border-b border-card-border flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight">{d.name}</h2>
            <span
              className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border"
              style={{
                color: d.color,
                borderColor: `${d.color}55`,
                backgroundColor: `${d.color}10`,
              }}
            >
              {d.tagline}
            </span>
          </div>
          <p className="text-base text-foreground/80 mt-3 leading-relaxed max-w-3xl">
            {d.mechanism}
          </p>
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </header>
      <div className="px-7 py-6">{children}</div>
    </section>
  );
}
