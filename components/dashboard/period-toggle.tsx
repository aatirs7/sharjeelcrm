import Link from "next/link";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "week", label: "week" },
  { value: "month", label: "month" },
] as const;

export function PeriodToggle({ period }: { period: "week" | "month" }) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-card p-0.5 font-mono">
      {OPTIONS.map((o) => (
        <Link
          key={o.value}
          href={`/?period=${o.value}`}
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
