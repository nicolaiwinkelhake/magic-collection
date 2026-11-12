import type { ReactNode } from "react";

// Großer Seitentitel wie in iOS-Apps. Beim Scrollen zeigt die Kopfzeile
// (AppNav) den Titel klein an. Rechts optional Aktionen.
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** kleine Zeile über dem Titel */
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-300/80">{eyebrow}</p>}
        <h1 className="text-[2rem] leading-[1.1] sm:text-4xl font-bold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 pb-1">{actions}</div>}
    </header>
  );
}
