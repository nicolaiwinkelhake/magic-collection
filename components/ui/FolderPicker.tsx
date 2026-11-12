"use client";

import { useState } from "react";
import type { Folder } from "@/lib/types";
import { promptCreateFolder, setFolderEntries } from "@/lib/folderApi";

// Ordner zuordnen wie Playlists: Eine Karte kann in beliebig vielen Ordnern
// stehen. Jeder Ordner hat einen Haken – Antippen fügt die Auswahl hinzu bzw.
// nimmt sie wieder heraus (sofort gespeichert). Bei mehreren Karten zeigt
// "–", dass nur ein Teil schon drin ist; Antippen fügt dann alle hinzu.
// Gilt für Sammlung (kind "card") und Wunschliste (kind "wishlist").

type Item = { id: string; folder_ids?: string[] | null };
type State = "all" | "some" | "none";

export function membership(items: Item[], folderId: string): State {
  const n = items.filter((i) => i.folder_ids?.includes(folderId)).length;
  return n === 0 ? "none" : n === items.length ? "all" : "some";
}

export function FolderPicker({
  kind,
  folders,
  items,
  onChanged,
  onFolderCreated,
  onClose,
}: {
  kind: "card" | "wishlist";
  folders: Folder[];
  /** die Karten, um die es geht (eine aus der Detailansicht oder die Auswahl) */
  items: Item[];
  /** nach erfolgreichem Speichern: lokal übernehmen */
  onChanged: (folderId: string, ids: string[], add: boolean) => void;
  onFolderCreated?: (folder: Folder) => void;
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // neu angelegte Ordner sofort zeigen (die Seite lädt sie im Hintergrund nach)
  const [created, setCreated] = useState<Folder[]>([]);
  const all = [...folders, ...created.filter((c) => !folders.some((f) => f.id === c.id))].sort((a, b) =>
    a.name.localeCompare(b.name, "de"),
  );
  const ids = items.map((i) => i.id);
  const busy = busyId !== null;
  const title = items.length === 1 ? "Ordner" : `${items.length} Karten – Ordner`;

  async function toggle(folderId: string, add: boolean) {
    setBusyId(folderId);
    setError(null);
    const r = await setFolderEntries(folderId, add ? "add" : "remove", kind === "card" ? { cardIds: ids } : { wishlistIds: ids });
    setBusyId(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    onChanged(folderId, ids, add);
  }

  async function create() {
    setError(null);
    const r = await promptCreateFolder();
    if (!r) return;
    if (r.error || !r.folder) {
      setError(r.error ?? "Ordner konnte nicht angelegt werden");
      return;
    }
    setCreated((c) => [...c, r.folder!]);
    onFolderCreated?.(r.folder);
    await toggle(r.folder.id, true);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-[2rem] sm:rounded-3xl bg-zinc-900 border border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)] sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{title}</h2>
            <p className="text-xs text-zinc-500">Eine Karte kann in mehreren Ordnern stehen.</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Schließen" className="shrink-0 w-9 h-9 rounded-full bg-white/10 disabled:opacity-50">
            ✕
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {all.length === 0 ? (
          <p className="text-sm text-zinc-400">Noch keine Ordner – leg den ersten an.</p>
        ) : (
          <ul className="max-h-[50dvh] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
            {all.map((f) => {
              const state = membership(items, f.id);
              return (
                <li key={f.id}>
                  <button
                    onClick={() => void toggle(f.id, state !== "all")}
                    disabled={busy}
                    role="checkbox"
                    aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-white/5 disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span aria-hidden>📁</span>
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span
                      aria-hidden
                      className={`shrink-0 grid place-items-center w-6 h-6 rounded-md border text-sm ${
                        state === "none" ? "border-white/20" : "bg-indigo-500 border-indigo-400 text-white"
                      }`}
                    >
                      {busyId === f.id ? "…" : state === "all" ? "✓" : state === "some" ? "–" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          onClick={() => void create()}
          disabled={busy}
          className="w-full rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-zinc-300 hover:border-white/40 disabled:opacity-50"
        >
          + Neuer Ordner
        </button>
        <button onClick={onClose} disabled={busy} className="w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium disabled:opacity-50">
          Fertig
        </button>
      </div>
    </div>
  );
}
