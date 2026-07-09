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
    <div className="flex flex-col items-center gap-2 border-b border-border/60 pb-6 text-center">
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
      <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
      {meta != null && (
        <p className="font-mono text-xs text-muted-foreground">{meta}</p>
      )}
      {action != null && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Centered "// label" divider for grouping sections within a page. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      {"//"} {children}
    </div>
  );
}
