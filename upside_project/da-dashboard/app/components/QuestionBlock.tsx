"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { DALayer } from "../data/mock";

export type VerdictStatus = "ok" | "warn" | "critical" | "info" | "na";

const dotColor: Record<VerdictStatus, string> = {
  ok: "bg-accent-green",
  warn: "bg-accent-yellow",
  critical: "bg-accent-red",
  info: "bg-accent-blue",
  na: "bg-muted/40",
};

const daLabel: Record<DALayer, string> = {
  ethereumda: "ETH",
  eigenda: "EGN",
  celestia: "CEL",
  avail: "AVL",
};

const borderAccent: Record<VerdictStatus, string> = {
  ok: "border-l-accent-green/60",
  warn: "border-l-accent-yellow/60",
  critical: "border-l-accent-red/70",
  info: "border-l-accent-blue/60",
  na: "border-l-muted/40",
};

export interface Verdict {
  da: DALayer;
  status: VerdictStatus;
  label?: string;
}

export interface QuestionBlockProps {
  number: string;
  question: string;
  summary: string;
  verdicts?: Verdict[];
  overall?: VerdictStatus;
  drillHref?: string;
  drillLabel?: string;
  drillComingSoon?: boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
}

export default function QuestionBlock({
  number,
  question,
  summary,
  verdicts,
  overall = "info",
  drillHref,
  drillLabel,
  drillComingSoon = false,
  defaultOpen = false,
  children,
}: QuestionBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`bg-card-bg border border-card-border border-l-4 ${borderAccent[overall]} rounded-xl overflow-hidden transition-colors`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-card-border/30 transition-colors"
        aria-expanded={open}
      >
        <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-card-border/60 text-xs font-mono font-bold text-muted">
          {number}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold">{question}</h3>
          </div>
          <p className="text-sm text-muted mt-1 leading-relaxed">{summary}</p>

          {verdicts && verdicts.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {verdicts.map((v) => (
                <span
                  key={v.da}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-card-border/40 text-xs font-mono"
                  title={v.label ?? v.status}
                >
                  <span className={`w-2 h-2 rounded-full ${dotColor[v.status]}`} />
                  <span className="text-muted">{daLabel[v.da]}</span>
                  {v.label && <span className="text-foreground">{v.label}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        <span
          className={`shrink-0 mt-1.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-card-border/60">
          <div className="pt-4">{children}</div>

          {drillHref && (
            <div className="mt-5 pt-4 border-t border-card-border/60">
              {drillComingSoon ? (
                <span className="inline-flex items-center gap-2 text-xs text-muted">
                  <span className="px-2 py-0.5 rounded bg-card-border/60 font-mono">soon</span>
                  {drillLabel ?? "Detail page coming soon"}
                </span>
              ) : (
                <Link
                  href={drillHref}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-blue hover:underline"
                >
                  {drillLabel ?? "See details"}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
