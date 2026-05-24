"use client";

import { useEffect, useState } from "react";

export type Tone = "ok" | "warn" | "critical" | undefined;

export function toneCls(t: Tone): string {
  return t === "critical"
    ? "text-accent-red"
    : t === "warn"
    ? "text-accent-yellow"
    : t === "ok"
    ? "text-accent-green"
    : "";
}

export function Card({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`bg-card-bg border border-card-border rounded-xl p-5 ${
        wide ? "lg:col-span-2" : ""
      }`}
    >
      <div className="mb-4">
        <h3 className="text-base font-bold tracking-tight">{title}</h3>
        {subtitle && (
          <p className="text-sm text-muted mt-1 leading-relaxed">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="border border-card-border rounded-lg p-4 bg-card-bg/40">
      <div className="text-xs uppercase tracking-wider text-muted mb-2">
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono leading-tight ${toneCls(tone)}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-1.5 leading-relaxed">{sub}</div>}
    </div>
  );
}

// Generic fetch hook used by every panel. Polls every `intervalMs` ms.
export function useApi<T>(type: string, intervalMs = 30_000) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetch(`/api/eth-da/security?type=${type}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setData(j);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [type, intervalMs]);

  return { data, err, loading };
}

export function Loading() {
  return <div className="text-sm text-muted py-8 text-center">로딩…</div>;
}

export function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="text-sm text-accent-red bg-accent-red/10 border border-accent-red/30 rounded p-3 font-mono">
      {msg}
    </div>
  );
}

export function fmtMs(ms?: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtWei(weiStr?: string | number | null): string {
  if (weiStr == null) return "—";
  const w = typeof weiStr === "string" ? Number(weiStr) : weiStr;
  if (!isFinite(w)) return "—";
  if (w < 1) return `${w} wei`;
  if (w < 1e3) return `${w.toFixed(0)} wei`;
  if (w < 1e9) return `${(w / 1e3).toFixed(2)} kwei`;
  if (w < 1e15) return `${(w / 1e9).toFixed(3)} gwei`;
  return `${(w / 1e18).toExponential(2)} ETH`;
}

// Chart palette aligned with existing dashboard
export const colors = {
  blue: "#627eea",      // Ethereum brand
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
  purple: "#a78bfa",
  cyan: "#06b6d4",
  grid: "#2a2a30",
  axis: "#9ca3af",
  tooltipBg: "#131316",
  tooltipBorder: "#2a2a30",
};

export const tooltipStyle = {
  background: colors.tooltipBg,
  border: `1px solid ${colors.tooltipBorder}`,
  borderRadius: 8,
  fontSize: 13,
};
