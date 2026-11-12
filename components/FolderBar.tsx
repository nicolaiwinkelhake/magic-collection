"use client";

import { useEffect, useState } from "react";
import { formatEur } from "@/lib/format";
import { ALL, UNSORTED, type FolderFilter, type FolderStat } from "@/lib/folders";
import type { Folder } from "@/lib/types";

// Ordnerauswahl (Sammlung und Wunschliste): "Alle", "Ohne Ordner" und eigene
// Ordner mit Kartenzahl und Wert. Eine Karte kann in mehreren Ordnern stehen
// und zählt dann in jedem mit.
// Handy: ein Knopf mit dem gewählten Ordner – Antippen öffnet von unten die
// Liste aller Ordner (dort auch anlegen, umbenennen, löschen). Kein
// seitliches Wischen nötig.
// Größere Bildschirme: alle Ordner als Kacheln, die umbrechen.

type Tile = { key: FolderFilter; label: string; icon: string };

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
  const [open, setOpen] = useState(false);
  const tiles: Tile[] = [
    { key: ALL, label: "Alle", icon: "🗂️" },
    // "Ohne Ordner" nur zeigen, wenn es Ordner gibt
    ...(folders.length ? [{ key: UNSORTED, label: "Ohne Ordner", icon: "📥" }] : []),
    ...folders.map((f) => ({ key: f.id, label: f.name, icon: "📁" })),
  ];
  const current = tiles.find((t) => t.key === active) ?? tiles[0];
  const activeFolder = folders.find((f) => f.id === active);
  const stat = (key: FolderFilter) => stats.get(key) ?? { cards: 0, entries: 0, value: 0 };
  const summary = (key: FolderFilter) => {
    const s = stat(key);
    return (
      <>
        {s.cards} {s.cards === 1 ? "Karte" : "Karten"} · <span className="text-emerald-400">{formatEur(s.value)}</span>
      </>
    );
  };

  // Escape schließt die Liste
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = (key: FolderFilter) => {
    onSelect(key);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {/* Handy: ein Knopf, Liste im Blatt */}
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Ordner: ${current.label} – Ordner wechseln`}
        className="sm:hidden w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-left"
      >
        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-indigo-500/20 text-lg" aria-hidden>
          {current.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold truncate">{current.label}</span>
          <span className="block text-xs text-zinc-400 tabular-nums">{summary(current.key)}</span>
        </span>
        <span className="shrink-0 text-xs text-zinc-400">
          {folders.length ? `${folders.length} Ordner` : "Ordner"}
        </span>
        <span className="shrink-0 text-zinc-500" aria-hidden>
          ▾
        </span>
      </button>

      {/* Größere Bildschirme: Kacheln, die umbrechen */}
      <div className="hidden sm:flex flex-wrap gap-2" role="tablist" aria-label="Ordner">
        {tiles.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(t.key)}
              className={`min-w-[8rem] max-w-[13rem] text-left rounded-xl border px-3 py-2 transition ${
                on ? "bg-indigo-500/20 border-indigo-400/60" : "bg-white/5 border-white/10 hover:border-white/20"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium truncate">
                <span aria-hidden>{t.icon}</span>
                <span className="truncate">{t.label}</span>
              </span>
              <span className="block text-xs text-zinc-400 tabular-nums">{summary(t.key)}</span>
            </button>
          );
        })}
        <button
          onClick={onCreate}
          disabled={busy}
          className="rounded-xl border border-dashed border-white/20 px-3 py-2 text-sm text-zinc-300 hover:border-white/40 disabled:opacity-50"
        >
          + Ordner
        </button>
      </div>
      {activeFolder && (
        <div className="hidden sm:flex items-center gap-3 text-xs">
          <button onClick={() => onRename(activeFolder)} disabled={busy} className="text-zinc-400 hover:text-white disabled:opacity-50">
            Umbenennen
          </button>
          <button onClick={() => onDelete(activeFolder)} disabled={busy} className="text-zinc-400 hover:text-red-400 disabled:opacity-50">
            Ordner löschen
          </button>
        </div>
      )}

      {open && (
        <div className="sm:hidden fixed inset-0 z-[70] flex items-end" role="dialog" aria-modal="true" aria-label="Ordner wählen">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative w-full max-h-[85dvh] flex flex-col rounded-t-[2rem] border-t border-white/10 bg-zinc-900/95 backdrop-blur-2xl pb-[calc(1rem+env(safe-area-inset-bottom))] animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)]">
            <div className="px-4 pt-2.5 pb-2">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15" aria-hidden />
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Ordner</h2>
                <button onClick={() => setOpen(false)} aria-label="Schließen" className="icon-btn w-9 h-9">
                  ✕
                </button>
              </div>
            </div>
            <ul className="overflow-y-auto px-4 space-y-1.5">
              {tiles.map((t) => {
                const on = active === t.key;
                return (
                  <li key={t.key}>
                    <button
                      onClick={() => pick(t.key)}
                      aria-current={on || undefined}
                      className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left border ${
                        on ? "bg-indigo-500/20 border-indigo-400/50" : "bg-white/[0.04] border-transparent active:bg-white/10"
                      }`}
                    >
                      <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-white/[0.06] text-lg" aria-hidden>
                        {t.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">{t.label}</span>
                        <span className="block text-xs text-zinc-400 tabular-nums">{summary(t.key)}</span>
                      </span>
                      {on && <span className="text-indigo-300 text-lg" aria-hidden>✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 pt-3 space-y-2">
              <button
                onClick={() => {
                  setOpen(false);
                  onCreate();
                }}
                disabled={busy}
                className="btn-secondary w-full border-dashed"
              >
                + Neuer Ordner
              </button>
              {activeFolder && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setOpen(false);
                      onRename(activeFolder);
                    }}
                    disabled={busy}
                    className="btn-ghost"
                  >
                    Umbenennen
                  </button>
                  <button
                    onClick={() => {
                      setOpen(false);
                      onDelete(activeFolder);
                    }}
                    disabled={busy}
                    className="btn-ghost text-red-400 hover:text-red-300"
                  >
                    Ordner löschen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
