"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import type { ScanMatch } from "@/lib/scanStack";
import type { CardHash } from "@/lib/imageHash";
import { distancesTo } from "@/lib/printHashClient";
import { catalogPrints } from "@/lib/catalogClient";

// So viele Drucke (neueste zuerst) werden höchstens mit dem Foto verglichen –
// Standardländer haben Hunderte, die übrigen bleiben per Suche erreichbar.
const MAX_COMPARE = 200;

// Alle Drucke einer Karte zur Auswahl (Scryfall, neueste zuerst), mit
// Suchfeld für Set-Name/-Kürzel/Nummer. Lädt auch weitere Seiten, damit
// Karten mit sehr vielen Drucken (z. B. Standardländer) vollständig sind.

type Raw = {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  released_at?: string;
  type_line: string;
  lang?: string;
  prices?: { eur?: string | null; eur_foil?: string | null };
  image_uris?: { normal?: string };
  card_faces?: { image_uris?: { normal?: string } }[];
};

export type Print = ScanMatch & { releasedAt?: string };

const MAX_PAGES = 6; // 6 × 175 Drucke

// Pro Sitzung merken: dieselbe Karte nicht mehrfach laden.
const cache = new Map<string, Print[]>();

/**
 * Alle Drucke einer Karte: zuerst aus dem eigenen Katalog (schnell, alle
 * Papier-Drucke), sonst von Scryfall. Für die Versionserkennung im Scanner.
 */
export async function loadPrints(name: string): Promise<Print[]> {
  const local = await catalogPrints(name).catch(() => []);
  if (local.length) return local;
  return scryfallPrints(name);
}

/** Drucke von Scryfall (vollständig inkl. Sonderdrucke, langsamer). */
export async function scryfallPrints(name: string): Promise<Print[]> {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const q = new URLSearchParams({
    q: `!"${name.replace(/"/g, "")}" include:extras`,
    unique: "prints",
    order: "released",
    dir: "desc",
  });
  let url: string | null = `https://api.scryfall.com/cards/search?${q}`;
  const out: Print[] = [];
  for (let page = 0; url && page < MAX_PAGES; page++) {
    let data: { data?: Raw[]; has_more?: boolean; next_page?: string } | null = null;
    for (let attempt = 1; attempt <= 3 && !data; attempt++) {
      try {
        const res: Response = await fetch(url);
        if (res.status === 404) return out; // keine Treffer
        if (res.ok) data = await res.json();
        else if (res.status !== 429 && res.status < 500) throw new Error(String(res.status));
      } catch (e) {
        if (attempt === 3) throw e;
      }
      if (!data) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
    if (!data) throw new Error("Scryfall nicht erreichbar");
    for (const c of data.data ?? []) {
      out.push({
        id: c.id,
        name: c.name,
        imageUrl: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
        eur: c.prices?.eur ? parseFloat(c.prices.eur) : null,
        eurFoil: c.prices?.eur_foil ? parseFloat(c.prices.eur_foil) : null,
        typeLine: c.type_line,
        set: c.set,
        setName: c.set_name,
        collectorNumber: c.collector_number,
        releasedAt: c.released_at,
        exact: true,
      });
    }
    url = data.has_more && data.next_page ? data.next_page : null;
    if (url) await new Promise((r) => setTimeout(r, 120)); // Scryfall-Rate-Limit
  }
  cache.set(key, out);
  return out;
}

/** Drucke zusammenführen (ohne Doppelte), neueste zuerst. */
export function mergePrints(a: Print[], b: Print[]): Print[] {
  const seen = new Set(a.map((p) => p.id));
  const all = [...a, ...b.filter((p) => !seen.has(p.id))];
  return all.sort((x, y) => (y.releasedAt ?? "").localeCompare(x.releasedAt ?? ""));
}

export function PrintPicker({
  name,
  currentId,
  reference,
  busy = false,
  error,
  onPick,
  onClose,
}: {
  name: string;
  currentId?: string;
  /** Fingerabdruck des Kamerabilds: dann nach Ähnlichkeit sortieren */
  reference?: CardHash;
  busy?: boolean;
  error?: string | null;
  onPick: (print: Print) => void;
  onClose: () => void;
}) {
  const [prints, setPrints] = useState<Print[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Bildabstand je Druck (kleiner = ähnlicher), wird nach und nach gefüllt
  const [dist, setDist] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;
    setPrints(null);
    setLoadError(null);
    // Katalog sofort anzeigen, Scryfall im Hintergrund ergänzen (Sonderdrucke)
    void (async () => {
      const local = await catalogPrints(name).catch(() => []);
      if (cancelled) return;
      if (local.length) setPrints(local);
      try {
        const full = await scryfallPrints(name);
        if (cancelled) return;
        setPrints(mergePrints(local, full));
      } catch {
        if (!cancelled && !local.length) setLoadError("Drucke konnten nicht geladen werden.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, attempt]);

  // Fingerabdruck nach Inhalt stabil halten – die Elternseite (Scanner)
  // rendert oft neu und erzeugt dabei jedes Mal ein neues Array.
  const refKey = reference ? Array.from(reference).join("") : "";
  const stableRef = useMemo(() => (refKey ? Uint8Array.from(refKey, (c) => Number(c)) : undefined), [refKey]);

  // Mit Kamerabild: Drucke nacheinander vergleichen (neueste zuerst)
  useEffect(() => {
    const reference = stableRef;
    if (!reference || !prints?.length) return;
    const signal = { cancelled: false };
    setDist({});
    void distancesTo(
      reference,
      prints.slice(0, MAX_COMPARE),
      (id, d) => setDist((prev) => ({ ...prev, [id]: d })),
      { signal },
    );
    return () => {
      signal.cancelled = true;
    };
  }, [stableRef, prints]);

  // Sichtbarer Bereich über der Bildschirmtastatur: Das Fenster wird darin
  // eingepasst, sonst liegen die Treffer hinter der Tastatur und man muss
  // erst nach unten scrollen.
  const [view, setView] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setView({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  const keyboardOpen = view != null && typeof window !== "undefined" && window.innerHeight - view.height > 120;

  // Nach jeder Sucheingabe die Trefferliste wieder von oben zeigen
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [filter]);

  // Escape schließt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = prints ?? [];
    const filtered = f
      ? list.filter(
          (p) =>
            p.setName?.toLowerCase().includes(f) ||
            p.set?.toLowerCase() === f ||
            p.set?.toLowerCase().startsWith(f) ||
            p.collectorNumber === f ||
            p.releasedAt?.startsWith(f),
        )
      : list;
    if (reference) {
      // Nach Ähnlichkeit zum Foto; noch nicht verglichene dahinter (Datum)
      const d = (id: string) => dist[id] ?? Number.POSITIVE_INFINITY;
      return [...filtered].sort((a, b) => d(a.id) - d(b.id));
    }
    // aktuellen Druck nach vorn
    return [...filtered].sort((a, b) => (a.id === currentId ? -1 : b.id === currentId ? 1 : 0));
  }, [prints, filter, currentId, reference, dist]);

  const compared = Object.keys(dist).length;
  const toCompare = Math.min(prints?.length ?? 0, MAX_COMPARE);

  return (
    <div
      className={`fixed inset-x-0 z-[70] flex ${keyboardOpen ? "items-start" : "items-end"} sm:items-center justify-center bg-black/75`}
      style={view ? { top: view.top, height: view.height } : { top: 0, bottom: 0 }}
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Druck von ${name} wählen`}
    >
      <div
        className={`w-full sm:max-w-2xl flex flex-col sm:rounded-3xl bg-zinc-900 border border-white/10 ${
          keyboardOpen ? "h-full rounded-none" : "max-h-[88%] rounded-t-[2rem] pb-[env(safe-area-inset-bottom)] animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)] sm:animate-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 pb-3 space-y-3 border-b border-white/5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold truncate">Druck wählen</h2>
              <p className="text-xs text-zinc-500 truncate">
                {name}
                {prints && ` · ${prints.length} Drucke`}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={busy}
              aria-label="Schließen"
              className="shrink-0 w-9 h-9 rounded-full bg-white/10 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
          <div className="relative">
            <input
              type="search"
              enterKeyHint="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              // "Suchen" auf der Tastatur schließt sie – dann ist die ganze Liste frei
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder="Set, Kürzel, Nummer oder Jahr …"
              aria-label="Drucke filtern"
              className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-3 pr-20 text-sm outline-none focus:border-indigo-400/70"
            />
            {prints && filter.trim() && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 tabular-nums" aria-live="polite">
                {shown.length} Treffer
              </span>
            )}
          </div>
          {reference && prints && prints.length > 1 && (
            <p className="text-xs text-sky-300">
              Nach Ähnlichkeit zu deinem Foto sortiert
              {compared < toCompare ? ` · vergleiche ${compared}/${toCompare} …` : ""}
              {prints.length > MAX_COMPARE && compared >= toCompare && ` · die ${MAX_COMPARE} neuesten verglichen, ältere per Suche`}
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {busy && <p className="text-sm text-indigo-300">Speichere …</p>}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pt-3">
          {loadError ? (
            <div className="space-y-2 text-sm">
              <p className="text-red-400">{loadError}</p>
              <button onClick={() => setAttempt((a) => a + 1)} className="rounded-lg bg-white/10 px-3 py-1.5">
                Erneut versuchen
              </button>
            </div>
          ) : prints == null ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" aria-label="Lade Drucke">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-[63/88] rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="text-sm text-zinc-400">Keine passenden Drucke.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {shown.map((p, i) => {
                const current = p.id === currentId;
                return (
                  <button
                    key={p.id}
                    onClick={() => !current && onPick(p)}
                    disabled={busy}
                    aria-current={current || undefined}
                    className={`text-left rounded-lg overflow-hidden border disabled:opacity-60 ${
                      current ? "border-emerald-400 ring-2 ring-emerald-500/50" : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    {p.imageUrl ? (
                      <Image src={p.imageUrl} alt={`${p.name} – ${p.setName}`} width={146} height={204} className="w-full h-auto" />
                    ) : (
                      <div className="aspect-[63/88] bg-zinc-800" />
                    )}
                    <span className="block px-1.5 py-1 text-[10px] leading-tight">
                      <span className="block truncate text-zinc-300">{p.setName}</span>
                      <span className="text-zinc-500 uppercase">
                        {p.set} #{p.collectorNumber}
                        {p.releasedAt && ` · ${p.releasedAt.slice(0, 4)}`}
                      </span>
                      <span className="block text-emerald-400">
                        {p.eur != null ? formatEur(p.eur) : "–"}
                        {p.eurFoil != null && <span className="text-fuchsia-300"> · F {formatEur(p.eurFoil)}</span>}
                      </span>
                      {current && <span className="block text-emerald-300">aktuell</span>}
                      {reference && i === 0 && dist[p.id] != null && compared >= Math.min(toCompare, 2) && (
                        <span className="block text-sky-300">am ähnlichsten</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
