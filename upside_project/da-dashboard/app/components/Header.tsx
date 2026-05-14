"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/survival", label: "Blob Lifecycle" },
  { href: "/spec-vs-reality", label: "Spec vs Reality" },
  { href: "/incidents", label: "Incidents" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-card-border bg-card-bg/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center text-sm font-bold">
            DA
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">DA Watch</h1>
            <p className="text-xs text-muted">Data Availability Monitor</p>
          </div>
        </div>

        <nav className="flex gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent-blue/20 text-accent-blue"
                    : "text-muted hover:text-foreground hover:bg-card-border/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            Live
          </span>
          <span>Updated 30s ago</span>
        </div>
      </div>
    </header>
  );
}
