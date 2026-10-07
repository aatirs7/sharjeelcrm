import Link from "next/link";
import { cn } from "@/lib/utils";

const DEFAULT_OPTIONS = [
  { value: "week", label: "week" },
  { value: "month", label: "month" },
] as const;

/**
 * Period selector driven by the `?period=` search param. Defaults to the
 * dashboard's week/month at `/`; pass `basePath` + `options` to reuse it
 * elsewhere (e.g. the revenue page's all-time / month / week).
 */
export function PeriodToggle({
  period,
  basePath = "/",
  options = DEFAULT_OPTIONS as readonly { value: string; label: string }[],
}: {
  period: string;
  basePath?: string;
  options?: readonly { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-card p-0.5 font-mono">
      {options.map((o) => (
        <Link
          key={o.value}
          href={`${basePath}?period=${o.value}`}
          className={cn(
            "rounded-[6px] px-3 py-1 text-[11px] uppercase tracking-[0.14em] transition-colors",
            period === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
