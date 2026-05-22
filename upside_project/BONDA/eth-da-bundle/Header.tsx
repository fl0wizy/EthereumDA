"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/liveness", label: "Liveness" },
  { href: "/eth-da-security", label: "ETH DA · Safety/Liveness" },
  { href: "/spec-vs-reality", label: "Spec vs Reality" },
  { href: "/threat-modeling", label: "Threat Modeling" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-card-border bg-card-bg/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-card-border flex items-center justify-center text-base font-bold tracking-tight">
            B
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">BONDA</h1>
            <p className="text-xs text-muted">DA Security Dashboard</p>
          </div>
        </Link>

        <nav className="flex flex-wrap gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-base font-medium transition-colors ${
                  isActive
                    ? "bg-card-border text-foreground"
                    : "text-muted hover:text-foreground hover:bg-card-border/60"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2 text-xs text-muted shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
          <span>실시간</span>
        </div>
      </div>
    </header>
  );
}
