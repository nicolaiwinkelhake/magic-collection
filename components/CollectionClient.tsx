"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Filters, type FilterState } from "@/components/Filters";
import { CardGrid } from "@/components/CardGrid";
import { ImportForm } from "@/components/ImportForm";
import { formatEur } from "@/lib/format";
import { totalValue as computeTotalValue } from "@/lib/valuation";
import type { Card, Folder } from "@/lib/types";
import { FolderBar } from "@/components/FolderBar";
import { ALL, UNSORTED, collectionMeasure, folderStats, inFolder, type FolderFilter } from "@/lib/folders";
import { deleteFolder, promptCreateFolder, renameFolder } from "@/lib/folderApi";

export function CollectionClient({
  initialCards,
  loadError,
  initialFolders = [],
}: {
  initialCards: Card[];
  loadError?: string;
  /** eigene Ordner (Migration 014) */
  initialFolders?: Folder[];
}) {
  const router = useRouter();

  // Ordner: Auswahl wird im Browser gemerkt; verschwundene Ordner → "Alle"
  const folders = initialFolders;
  const [folder, setFolder] = useState<FolderFilter>(ALL);
  const [folderBusy, setFolderBusy] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("collection-folder");
      if (saved) setFolder(saved);
    } catch {
      // Speicher gesperrt
    }
  }, []);
  useEffect(() => {
    if (folder !== ALL && folder !== UNSORTED && !folders.some((f) => f.id === folder)) setFolder(ALL);
  }, [folder, folders]);
  function selectFolder(f: FolderFilter) {
    setFolder(f);
    try {
      window.localStorage.setItem("collection-folder", f);
    } catch {
      // ignorieren
    }
  }
  const stats = useMemo(() => folderStats(initialCards, collectionMeasure), [initialCards]);
  const folderCards = useMemo(() => inFolder(initialCards, folder), [initialCards, folder]);
  const activeFolder = folders.find((f) => f.id === folder);

  async function handleCreateFolder() {
    setFolderBusy(true);
    const r = await promptCreateFolder();
    setFolderBusy(false);
    if (!r) return;
    if (r.error || !r.folder) {
      alert(r.error ?? "Ordner konnte nicht angelegt werden");
      return;
    }
    selectFolder(r.folder.id);
    router.refresh();
  }

  async function handleRenameFolder(f: Folder) {
    setFolderBusy(true);
    const err = await renameFolder(f);
    setFolderBusy(false);
    if (err) alert(err);
    router.refresh();
  }

  async function handleDeleteFolder(f: Folder) {
    setFolderBusy(true);
    const r = await deleteFolder(f, stats.get(f.id)?.entries ?? 0);
    setFolderBusy(false);
    if (r === "cancelled") return;
    if (r) {
      alert(r);
      return;
    }
    selectFolder(ALL);
    router.refresh();
  }

  const [backfilling, setBackfilling] = useState(false);

  // Fehlende Metadaten (set_code, rarity) im Hintergrund nachfüllen
  useEffect(() => {
    const hasMissing = initialCards.some((c) => !c.set_code || !c.rarity);
    if (!hasMissing) return;
    setBackfilling(true);
    fetch("/api/cards/fix-metadata", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (d.updated > 0) router.refresh(); })
      .catch(() => {})
      .finally(() => setBackfilling(false));
  }, []);

  const [filters, setFilters] = useState<FilterState>({
    search: "",
    colors: [],
    rarity: "",
    type: "",
    set: "",
    sort: "color",
    group: "none",
  });

  // Gruppierung im Browser merken.
  useEffect(() => {
    try {
      const g = window.localStorage.getItem("collection-group");
      if (g && ["none", "set", "color", "rarity", "type"].includes(g)) {
        setFilters((f) => ({ ...f, group: g as FilterState["group"] }));
      }
    } catch {
      // Speicher gesperrt: Standard behalten.
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("collection-group", filters.group);
    } catch {
      // ignorieren
    }
  }, [filters.group]);

  const availableSets = useMemo(() => {
    const codes = new Set<string>();
    for (const c of folderCards) if (c.set_code) codes.add(c.set_code);
    return [...codes].sort();
  }, [folderCards]);

  // Deutsche Namen für Bestandskarten im Hintergrund nachfüllen (in Runden,
  // bis nichts mehr offen ist oder eine Runde nichts schafft).
  const [germanPending, setGermanPending] = useState<number | null>(null);
  useEffect(() => {
    if (!initialCards.some((c) => c.name_de == null)) return;
    let cancelled = false;
    (async () => {
      let anyUpdated = false;
      for (let round = 0; round < 50 && !cancelled; round++) {
        const d = await fetch("/api/cards/german-names", { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (!d || d.updated === 0) break;
        anyUpdated = true;
        setGermanPending(d.remaining);
        if (d.remaining === 0) break;
      }
      if (!cancelled) {
        setGermanPending(null);
        if (anyUpdated) router.refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCards = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const result = folderCards.filter((card) => {
      if (
        search &&
        !card.name.toLowerCase().includes(search) &&
        !card.name_de?.toLowerCase().includes(search)
      ) {
        return false;
      }
      if (filters.rarity && card.rarity !== filters.rarity) return false;
      if (filters.set && card.set_code !== filters.set) return false;
      if (
        filters.type &&
        !card.type_line?.toLowerCase().includes(filters.type.toLowerCase())
      ) {
        return false;
      }
      if (filters.colors.length) {
        const cardColors = card.colors ?? [];
        const matchesAll = filters.colors.every((c) =>
          cardColors.includes(c)
        );
        if (!matchesAll) return false;
      }
      return true;
    });

    const priceOf = (c: Card) =>
      (c.foil ? c.price_eur_foil : c.price_eur) ?? 0;

    // WUBRG-Reihenfolge: Weiß, Blau, Schwarz, Rot, Grün, Mehrfarbig, Farblos
    const COLOR_ORDER: Record<string, number> = { W: 0, U: 1, B: 2, R: 3, G: 4 };
    function colorRank(colors: string[] | null): number {
      const c = colors ?? [];
      if (c.length === 0) return 6; // farblos
      if (c.length > 1) return 5;  // mehrfarbig
      return COLOR_ORDER[c[0]] ?? 6;
    }

    const sorted = [...result];
    switch (filters.sort) {
      case "color":
        sorted.sort((a, b) =>
          colorRank(a.colors) - colorRank(b.colors) || a.name.localeCompare(b.name)
        );
        break;
      case "cmc":
        sorted.sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0));
        break;
      case "price":
        sorted.sort((a, b) => priceOf(b) - priceOf(a));
        break;
      case "set":
        sorted.sort((a, b) =>
          (a.set_code ?? "").localeCompare(b.set_code ?? "") ||
          a.name.localeCompare(b.name)
        );
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [folderCards, filters]);

  const totalValue = useMemo(
    () => computeTotalValue(filteredCards),
    [filteredCards]
  );

  const totalCardCount = (cards: Card[]) =>
    cards.reduce((sum, c) => sum + (c.quantity ?? 1), 0);
  const filteredCount = useMemo(() => totalCardCount(filteredCards), [filteredCards]);
  const overallCount = useMemo(() => totalCardCount(folderCards), [folderCards]);

  const formattedTotal = formatEur(totalValue);

  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshPrices() {
    setRefreshing(true);
    await fetch("/api/prices/refresh", { method: "POST" });
    setRefreshing(false);
    router.refresh();
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-5 sm:py-8 space-y-4">
      {backfilling && (
        <div className="flex items-center gap-2 bg-indigo-900/40 border border-indigo-700 rounded-lg px-4 py-2 text-sm text-indigo-300">
          <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Kartendaten werden von Scryfall aktualisiert…
        </div>
      )}
      {germanPending !== null && (
        <p className="text-sm text-indigo-300" aria-live="polite">
          Deutsche Kartennamen werden ergänzt… noch {germanPending} Namen offen.
        </p>
      )}
      {/* Kopfbereich: Gesamtwert groß, Kennzahlen darunter */}
      <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/20 via-zinc-900/80 to-emerald-500/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-sm font-medium text-zinc-400 truncate">
              Sammlung
              {folder !== ALL && <span className="text-zinc-300"> · {activeFolder?.name ?? "Ohne Ordner"}</span>}
            </h1>
            <p className="mt-1 text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums">{formattedTotal}</p>
            {filteredCards.length !== folderCards.length && (
              <p className="text-xs text-zinc-500 mt-0.5">Wert der gefilterten Karten</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshPrices}
              disabled={refreshing}
              title="Preise aktualisieren"
              aria-label="Preise aktualisieren"
              className="grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 transition disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" />
              </svg>
            </button>
            <a
              href="/api/export"
              title="CSV-Export"
              aria-label="CSV-Export"
              className="grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 transition"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
              </svg>
            </a>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center sm:max-w-md">
          <Stat label="Karten" value={filteredCount === overallCount ? `${overallCount}` : `${filteredCount}/${overallCount}`} />
          <Stat
            label="Einträge"
            value={filteredCards.length === folderCards.length ? `${folderCards.length}` : `${filteredCards.length}/${folderCards.length}`}
          />
          <Stat label="Sets" value={`${availableSets.length}`} />
        </dl>
        {refreshing && <p className="mt-3 text-xs text-indigo-300" aria-live="polite">Preise werden aktualisiert…</p>}
      </header>

      <FolderBar
        folders={folders}
        stats={stats}
        active={folder}
        onSelect={selectFolder}
        onCreate={() => void handleCreateFolder()}
        onRename={(f) => void handleRenameFolder(f)}
        onDelete={(f) => void handleDeleteFolder(f)}
        busy={folderBusy}
      />

      <ImportForm
        folders={folders}
        defaultFolderId={folder !== ALL && folder !== UNSORTED ? folder : null}
        onFoldersChanged={() => router.refresh()}
      />

      {loadError && (
        <p className="text-red-400">Fehler beim Laden: {loadError}</p>
      )}

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 px-4 py-3 bg-[#0f0f12]/85 backdrop-blur-xl">
        <Filters state={filters} onChange={setFilters} sets={availableSets} />
      </div>

      <CardGrid cards={filteredCards} groupBy={filters.group} folders={folders} onFoldersChanged={() => router.refresh()} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/25 px-2 py-2">
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      <dt className="text-[11px] text-zinc-400">{label}</dt>
    </div>
  );
}
