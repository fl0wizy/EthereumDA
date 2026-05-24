"use client";

import type { ReactNode } from "react";
import { daInfo } from "../data/mock";
import type { DALayer } from "../data/mock";

export const DA_ORDER: DALayer[] = ["ethereumda", "eigenda", "celestia", "avail"];

/**
 * Anchor nav rendered at the top of each per-DA page. Clicking a chip
 * scrolls to the corresponding <DASection> via native anchor behavior.
 */
export function DAAnchorNav() {
  return (
    <nav className="sticky top-[72px] z-40 -mx-6 px-6 py-3 bg-background/85 backdrop-blur-sm border-b border-card-border">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted mr-2 font-medium">Jump to:</span>
        {DA_ORDER.map((id) => {
          const d = daInfo[id];
          return (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-card-border bg-card-bg hover:border-muted/60 transition-colors text-sm"
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="font-medium">{d.name}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Per-DA section wrapper. Renders a colored header bar + tagline,
 * and an anchor target so DAAnchorNav can scroll to it.
 */
export function DASection({
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
      id={da}
      className="scroll-mt-32 bg-card-bg border border-card-border rounded-xl overflow-hidden"
      style={{ borderTopColor: d.color, borderTopWidth: "3px" }}
    >
      <header className="px-6 py-4 border-b border-card-border flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{d.name}</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-card-border text-muted">
              {d.tagline}
            </span>
          </div>
          <p className="text-sm text-muted mt-1 max-w-3xl leading-relaxed">{d.mechanism}</p>
        </div>
        {rightSlot}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}
