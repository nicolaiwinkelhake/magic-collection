"use client";

// Leiste für die Mehrfachauswahl: unten fest (auf dem Handy über der
// Tab-Leiste), mit Anzahl, Alle/Keine, Abbrechen und der Aktion.
// Vor dem Ausführen fragt sie nach – Entfernen ist nicht rückgängig zu machen.

export function SelectionBar({
  count,
  total,
  onToggleAll,
  onCancel,
  onConfirm,
  actionLabel,
  confirmText,
  busy = false,
  overlay = false,
  secondary,
}: {
  count: number;
  total: number;
  onToggleAll: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** z. B. "Entfernen" */
  actionLabel: string;
  /** Rückfrage; {n} wird durch die Anzahl ersetzt */
  confirmText: string;
  busy?: boolean;
  /** über einem Vollbild-Fenster (z. B. Scanner) statt über der Tab-Leiste */
  overlay?: boolean;
  /** zusätzliche Aktion ohne Rückfrage, z. B. "Verschieben" */
  secondary?: { label: string; onClick: () => void };
}) {
  const allSelected = total > 0 && count === total;
  return (
    <div
      className={`fixed inset-x-0 px-3 animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)] ${
        overlay
          ? "z-[65] bottom-[calc(1rem+env(safe-area-inset-bottom))]"
          : "z-[45] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-4" // über dem Installations-Hinweis
      }`}
      role="toolbar"
      aria-label="Auswahl"
    >
      <div className="mx-auto max-w-xl flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl px-3 py-2.5 shadow-2xl shadow-black/60">
        <button onClick={onCancel} aria-label="Auswahl beenden" className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/10">
          ✕
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tabular-nums" aria-live="polite">
            {count} ausgewählt
          </p>
          <button onClick={onToggleAll} className="text-xs text-indigo-300 hover:text-indigo-200">
            {allSelected ? "Keine auswählen" : `Alle ${total} auswählen`}
          </button>
        </div>
        {secondary && (
          <button
            onClick={secondary.onClick}
            disabled={!count || busy}
            className="shrink-0 rounded-xl bg-white/10 hover:bg-white/15 px-3 h-10 text-sm font-medium disabled:opacity-40"
          >
            {secondary.label}
          </button>
        )}
        <button
          onClick={() => {
            if (count && confirm(withCount(confirmText, count))) onConfirm();
          }}
          disabled={!count || busy}
          className="shrink-0 rounded-xl bg-red-600 hover:bg-red-500 px-4 h-10 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? "…" : `${actionLabel}${count ? ` (${count})` : ""}`}
        </button>
      </div>
    </div>
  );
}

/** Haken-Kreis auf Karten/Zeilen im Auswahlmodus. */
export function SelectCheck({ selected, className = "" }: { selected: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center w-6 h-6 rounded-full border-2 text-xs font-bold transition ${
        selected ? "bg-indigo-500 border-indigo-300 text-white" : "bg-black/50 border-zinc-400 text-transparent"
      } ${className}`}
    >
      ✓
    </span>
  );
}

/** "{n} Karten" → "1 Karte" / "3 Karten" (auch Einträge/Eintrag). */
export function withCount(text: string, n: number): string {
  const t = text.replace("{n}", String(n));
  return n === 1 ? t.replace(/\b1 Karten\b/, "1 Karte").replace(/\b1 Einträge\b/, "1 Eintrag") : t;
}
