import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "default" | "admin";
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col items-center overflow-hidden rounded-xl border bg-card p-4 text-center ring-1 ring-foreground/[0.04] transition-colors hover:border-foreground/15",
        accent === "admin" && "border-primary/25"
      )}
    >
      <div className="flex items-center justify-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        {accent === "admin" && (
          <span className="rounded-[4px] bg-primary/12 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-primary">
            admin
          </span>
        )}
      </div>
      <div className="mt-3 font-heading text-[1.7rem] leading-none font-semibold tabular-nums">
        {value}
      </div>
      {sub != null && (
        <div className="mt-2 font-mono text-[11px] text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}
