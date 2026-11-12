"use client";

import { formatEur } from "@/lib/format";
import { ALL, UNSORTED, type FolderFilter, type FolderStat } from "@/lib/folders";
import type { Folder } from "@/lib/types";

// Ordnerleiste (Sammlung und Wunschliste): "Alle", "Ohne Ordner" und eigene
// Ordner als wischbare Kacheln mit Kartenzahl und Wert; "+ Ordner" legt einen
// neuen an. Eine Karte kann in mehreren Ordnern stehen und zählt dann in
// jedem mit. Der gewählte eigene Ordner lässt sich umbenennen oder löschen.

export function FolderBar({
  folders,
  stats,
  active,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  busy = false,
}: {
  folders: Folder[];
  stats: Map<string, FolderStat>;
  active: FolderFilter;
  onSelect: (f: FolderFilter) => void;
  onCreate: () => void;
  onRename: (f: Folder) => void;
  onDelete: (f: Folder) => void;
  busy?: boolean;
}) {
  const tiles: Array<{ key: FolderFilter; label: string }> = [
    { key: ALL, label: "Alle" },
    { key: UNSORTED, label: "Ohne Ordner" },
    ...folders.map((f) => ({ key: f.id, label: f.name })),
  ];
  const activeFolder = folders.find((f) => f.id === active);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1" role="tablist" aria-label="Ordner">
        {tiles.map((t) => {
          const s = stats.get(t.key) ?? { cards: 0, entries: 0, value: 0 };
          const on = active === t.key;
          // "Ohne Ordner" nur zeigen, wenn es Ordner gibt
          if (t.key === UNSORTED && !folders.length) return null;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(t.key)}
              className={`shrink-0 min-w-[7.5rem] max-w-[11rem] text-left rounded-xl border px-3 py-2 transition ${
                on ? "bg-indigo-500/20 border-indigo-400/60" : "bg-white/5 border-white/10 hover:border-white/20"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium truncate">
                <span aria-hidden>{t.key === ALL ? "🗂️" : t.key === UNSORTED ? "📥" : "📁"}</span>
                <span className="truncate">{t.label}</span>
              </span>
              <span className="block text-xs text-zinc-400 tabular-nums">
                {s.cards} {s.cards === 1 ? "Karte" : "Karten"} · <span className="text-emerald-400">{formatEur(s.value)}</span>
              </span>
            </button>
          );
        })}
        <button
          onClick={onCreate}
          disabled={busy}
          className="shrink-0 rounded-xl border border-dashed border-white/20 px-3 py-2 text-sm text-zinc-300 hover:border-white/40 disabled:opacity-50"
        >
          + Ordner
        </button>
      </div>
      {activeFolder && (
        <div className="flex items-center gap-3 text-xs">
          <button onClick={() => onRename(activeFolder)} disabled={busy} className="text-zinc-400 hover:text-white disabled:opacity-50">
            Umbenennen
          </button>
          <button onClick={() => onDelete(activeFolder)} disabled={busy} className="text-zinc-400 hover:text-red-400 disabled:opacity-50">
            Ordner löschen
          </button>
        </div>
      )}
    </div>
  );
}
