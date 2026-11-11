"use client";

import type { Folder } from "@/lib/types";

// Auswahl eines Zielordners (z. B. "In Ordner verschieben"): Unsortiert,
// eigene Ordner oder direkt einen neuen anlegen.
export function FolderPicker({
  folders,
  currentId,
  title = "In Ordner verschieben",
  busy = false,
  error,
  onPick,
  onCreate,
  onClose,
}: {
  folders: Folder[];
  /** aktueller Ordner (wird markiert); undefined = keiner markiert */
  currentId?: string | null;
  title?: string;
  busy?: boolean;
  error?: string | null;
  onPick: (folderId: string | null) => void;
  /** neuen Ordner anlegen und direkt wählen */
  onCreate: () => void;
  onClose: () => void;
}) {
  const options: Array<{ id: string | null; name: string }> = [{ id: null, name: "Unsortiert" }, ...folders];
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 animate-[sheet_200ms_ease-out] sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Schließen" className="w-9 h-9 rounded-full bg-white/10 disabled:opacity-50">
            ✕
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <ul className="max-h-[50dvh] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
          {options.map((o) => {
            const current = currentId !== undefined && (o.id ?? null) === (currentId ?? null);
            return (
              <li key={o.id ?? "none"}>
                <button
                  onClick={() => onPick(o.id)}
                  disabled={busy || current}
                  className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-white/5 disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span aria-hidden>{o.id ? "📁" : "📥"}</span>
                    <span className="truncate">{o.name}</span>
                  </span>
                  {current && <span className="text-xs text-emerald-300">aktuell</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          onClick={onCreate}
          disabled={busy}
          className="w-full rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-zinc-300 hover:border-white/40 disabled:opacity-50"
        >
          + Neuer Ordner
        </button>
        {busy && <p className="text-sm text-indigo-300 text-center">Verschiebe …</p>}
      </div>
    </div>
  );
}
