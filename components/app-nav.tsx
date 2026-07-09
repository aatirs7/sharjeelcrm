"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "dashboard" },
  { href: "/leads", label: "leads" },
  { href: "/orders", label: "orders" },
  { href: "/tasks", label: "tasks" },
  { href: "/customers", label: "customers" },
  { href: "/issues", label: "issues" },
  { href: "/affiliates", label: "affiliates" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu on navigation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[76rem] items-center gap-5 px-5">
        {/* wordmark */}
        <Link href="/" className="group flex items-center gap-2.5 whitespace-nowrap">
          <span className="grid size-6 place-items-center rounded-[5px] bg-primary text-primary-foreground shadow-sm">
            <span className="size-2 rounded-[2px] bg-primary-foreground" />
          </span>
          <span className="flex items-baseline gap-2">
            <span className="font-heading text-[15px] font-semibold tracking-tight">The Desk</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              crm://tiktok-shop
            </span>
          </span>
        </Link>

        {/* desktop nav (unchanged at md+) */}
        <nav className="ml-2 hidden flex-1 items-center gap-0.5 overflow-x-auto md:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-md px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && <span className="absolute inset-x-2 -bottom-[7px] h-px bg-primary" />}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* right controls */}
        <div className="ml-auto flex items-center gap-2 whitespace-nowrap md:ml-0 md:gap-3">
          <span className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground md:flex">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            live
          </span>
          <ThemeToggle />
          {/* mobile menu toggle. Wrapper carries md:hidden so it wins by
              specificity over the button's base `grid` display utility. */}
          <div className="md:hidden">
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* mobile menu panel (hidden at md+) */}
      {open && (
        <nav className="border-t border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl md:hidden">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center rounded-md px-3 py-2.5 font-mono text-[13px] uppercase tracking-[0.12em] transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {active && <span className="mr-2 text-primary">▸</span>}
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
