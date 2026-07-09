import Link from "next/link";

export function PageHeader({
  marker,
  title,
  meta,
  action,
  back,
}: {
  marker: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {back && (
            <>
              <Link href={back.href} className="hover:text-foreground">
                {back.label}
              </Link>
              <span className="text-border">/</span>
            </>
          )}
          <span>{"//"} {marker}</span>
        </div>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">{title}</h1>
        {meta != null && (
          <p className="mt-1.5 font-mono text-xs text-muted-foreground">{meta}</p>
        )}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Inline "// label" divider for grouping sections within a page. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      {"//"} {children}
    </div>
  );
}
