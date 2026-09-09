"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Menu, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/actions/auth";

import { can, type Capability, type Role } from "@/lib/permissions";

type NavItem = { href: string; label: string; cap: Capability; personal?: boolean };

const STAFF_NAV: NavItem[] = [
  { href: "/", label: "dashboard", cap: "financials" },
  { href: "/search", label: "search", cap: "deals" },
  { href: "/tickets", label: "deals", cap: "deals" },
  { href: "/orders", label: "orders", cap: "deals" },
  { href: "/customers", label: "customers", cap: "deals" },
  { href: "/issues", label: "issues", cap: "deals" },
  { href: "/tasks", label: "tasks", cap: "deals" },
  { href: "/me", label: "my performance", cap: "deals", personal: true },
  { href: "/revenue", label: "revenue", cap: "financials" },
  { href: "/analytics", label: "analytics", cap: "financials" },
  { href: "/payouts", label: "payouts", cap: "payouts" },
  { href: "/coaches", label: "coaches", cap: "coaches" },
  { href: "/content", label: "content", cap: "coaches" },
  { href: "/workers", label: "workers", cap: "workers" },
  { href: "/products", label: "products", cap: "products" },
  { href: "/inventory", label: "inventory", cap: "products" },
  { href: "/leaderboard", label: "leaderboard", cap: "leaderboard" },
  { href: "/fraud", label: "fraud", cap: "fraud" },
  { href: "/audit", label: "audit", cap: "audit" },
  { href: "/settings", label: "settings", cap: "settings" },
];

const COACH_NAV: NavItem[] = [{ href: "/coach", label: "dashboard", cap: "deals" }];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppNav({ role = "owner" }: { role?: Role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const personal = role === "worker" || role === "manager"; // owner/admin use /workers instead
  const NAV =
    role === "coach"
      ? COACH_NAV
      : STAFF_NAV.filter((n) => can(role, n.cap) && (!n.personal || personal));

  // Close the mobile menu on navigation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  // The PIN screen stands alone — no nav behind the lock.
  if (pathname === "/login") return null;

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
          {(role === "admin" || role === "owner") && (
            <button
              type="button"
              aria-label="What's new"
              title="What's new"
              onClick={() => window.dispatchEvent(new Event("open-whatsnew"))}
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Sparkles className="size-4" />
            </button>
          )}
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Lock"
              title="Lock"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Lock className="size-4" />
            </button>
          </form>
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
