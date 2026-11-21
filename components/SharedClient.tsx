"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatEur } from "@/lib/format";
import type { Card } from "@/lib/types";
import { selectAll } from "@/lib/supabase/selectAll";
import { totalValue } from "@/lib/valuation";
import { DEFAULT_FILTERS, filterAndSortCards, setCodes } from "@/lib/cardFilters";
import { Filters, type FilterState } from "@/components/Filters";
import { CardGrid } from "@/components/CardGrid";
import { PageHeader } from "@/components/ui/PageHeader";
import { TradeComposer } from "@/components/TradeComposer";
import { myDeckUses, ownedFor, ownedText } from "@/lib/ownedMatch";
import { useMyCollection } from "@/lib/useMyCollection";
import { addToBasket, basketCount, basketValue, groupByOwner, loadDrafts, saveDrafts, withDraft, type Basket } from "@/lib/tradeBasket";

// Geteilte Sammlungen von Freunden – gleiche Darstellung wie die eigene
// Sammlung (Wert-Kopf, Filter, Sortieren/Gruppieren, Liste/Raster/Details,
// wischbares Kartendetail), aber nur zum Ansehen. Karten lassen sich direkt
// für einen Trade anfragen (Kartendetail oder Mehrfachauswahl).

type Owner = { owner_id: string; owner_email: string };

const LAST_KEY = "shared-owner";
/** "Alle Freunde": die geteilten Sammlungen aller Freunde auf einmal durchsuchen */
const ALL = "*";
const displayName = (email: string) => email.split("@")[0];

export function SharedClient({ owners, notSharing = [] }: { owners: Owner[]; notSharing?: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<string>("");
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  // Trade-Korb je Freund (bleibt beim Wechseln zwischen Freunden erhalten)
  // Wird im Browser gemerkt, damit der Korb beim Seitenwechsel nicht verloren
  // geht; die Trades-Seite zeigt ihn als angefangenen Trade an.
  const [baskets, setBaskets] = useState<Record<string, Basket>>({});
  // Für welchen Freund ist der Trade-Dialog offen?
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const basketOf = (ownerId: string): Basket => baskets[ownerId] ?? [];
  const setBasketFor = (ownerId: string, b: Basket) => {
    setBaskets((all) => ({ ...all, [ownerId]: b }));
    const o = owners.find((x) => x.owner_id === ownerId);
    if (o) saveDrafts(withDraft(loadDrafts(), ownerId, displayName(o.owner_email), b, new Date().toISOString()));
  };
  // Karten kommen in den Trade-Korb ihres Besitzers: Aus der Suche über alle
  // Freunde entstehen so automatisch getrennte Trades je Person.
  function addCards(list: Card[]) {
    const byOwner = groupByOwner(list);
    for (const [ownerId, cs] of byOwner) setBasketFor(ownerId, addToBasket(basketOf(ownerId), cs));
    if (byOwner.size <= 1) {
      setToast(list.length === 1 ? `„${list[0].name}“ zum Trade hinzugefügt` : `${list.length} Karten zum Trade hinzugefügt`);
    } else {
      const parts = Array.from(byOwner, ([id, cs]) => `${displayName(owners.find((o) => o.owner_id === id)?.owner_email ?? "?")} ${cs.length}`);
      setToast(`${list.length} Karten auf ${byOwner.size} Trades verteilt (${parts.join(", ")})`);
    }
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function load(ownerId: string) {
    setSelected(ownerId);
    setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, group: f.group }));
    try {
      window.localStorage.setItem(LAST_KEY, ownerId);
    } catch {
      // ignorieren
    }
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    setCards([]);
    // Seitenweise: auch RPC-Ergebnisse kappt Supabase bei 1000 Zeilen.
    const fetchOne = (id: string) =>
      selectAll<Card>(() => supabase.rpc("shared_collection", { p_owner: id }).order("name").order("id")).catch(() => null);
    if (ownerId === ALL) {
      const lists = await Promise.all(owners.map((o) => fetchOne(o.owner_id)));
      const failed = owners.filter((_, i) => !lists[i]).map((o) => displayName(o.owner_email));
      setCards(lists.flatMap((l) => l ?? []));
      if (failed.length) setError(`Nicht geladen: ${failed.join(", ")}. Bitte später erneut versuchen.`);
    } else {
      const data = await fetchOne(ownerId);
      if (data) setCards(data);
      else setError("Sammlung konnte nicht geladen werden.");
    }
    setLoading(false);
  }

  // Zuletzt angesehene (oder die einzige) Sammlung direkt öffnen
  useEffect(() => {
    if (!owners.length) return;
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_KEY);
    } catch {
      // Speicher gesperrt
    }
    // gemerkte Trade-Körbe wiederherstellen
    const drafts = loadDrafts();
    setBaskets(Object.fromEntries(Object.entries(drafts).map(([id, d]) => [id, d.basket])));
    // von der Trades-Seite: /shared?trade=<Freund> öffnet den Korb direkt
    let wanted: string | null = null;
    try {
      wanted = new URLSearchParams(window.location.search).get("trade");
    } catch {
      // ignorieren
    }
    const fromTrade = owners.find((o) => o.owner_id === wanted)?.owner_id;
    const pick =
      fromTrade ?? (last === ALL && owners.length > 1 ? ALL : owners.find((o) => o.owner_id === last)?.owner_id) ?? (owners.length === 1 ? owners[0].owner_id : "");
    if (pick) void load(pick);
    if (fromTrade && drafts[fromTrade]) setComposerFor(fromTrade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Eigene Sammlung (einmal laden): zeigt in der Sammlung des Freundes, welche
  // Karten ich schon habe – damit ich keine Trades für eigene Karten anfrage.
  const { own, myDecks } = useMyCollection();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const deckUses = useMemo(() => (myDecks ? myDeckUses(cards, myDecks.cards, myDecks.decks) : undefined), [myDecks, cards]);
  const ownedCounts = useMemo(() => {
    if (!own) return undefined;
    const out: Record<string, number> = {};
    for (const c of cards) {
      const n = ownedFor(own, c).any;
      if (n) out[c.id] = n;
    }
    return out;
  }, [own, cards]);
  const missingCount = ownedCounts ? cards.filter((c) => !ownedCounts[c.id]).length : 0;

  const filtered = useMemo(() => {
    const list = filterAndSortCards(cards, filters);
    return onlyMissing && ownedCounts ? list.filter((c) => !ownedCounts[c.id]) : list;
  }, [cards, filters, onlyMissing, ownedCounts]);
  const sets = useMemo(() => setCodes(cards), [cards]);
  const value = useMemo(() => totalValue(filtered), [filtered]);
  const count = (list: Card[]) => list.reduce((s, c) => s + (c.quantity ?? 1), 0);
  const owner = owners.find((o) => o.owner_id === selected);
  const allMode = selected === ALL;
  // je Eintrag: wem er gehört (nur in der Ansicht "Alle Freunde" gezeigt)
  const ownerLabels = useMemo(() => {
    if (!allMode) return undefined;
    const names = new Map(owners.map((o) => [o.owner_id, displayName(o.owner_email)]));
    return Object.fromEntries(cards.map((c) => [c.id, names.get(c.user_id) ?? "?"]));
  }, [allMode, cards, owners]);
  // Trades, die gerade vorbereitet sind: in "Alle Freunde" alle, sonst nur der des angesehenen Freundes
  const barOwners = (allMode ? owners : owner ? [owner] : []).filter((o) => basketOf(o.owner_id).length > 0);
  const composerOwner = owners.find((o) => o.owner_id === composerFor) ?? null;

  if (!owners.length) {
    return (
      <main className="page max-w-5xl">
        <PageHeader title="Geteilte Sammlungen" subtitle="Sammlungen, die Freunde mit dir teilen" />
        <p className="surface p-4 text-sm text-zinc-400">
          Bisher hat niemand seine Sammlung mit dir geteilt. Freigaben werden unter „Freunde“ vergeben.
        </p>
      </main>
    );
  }

  return (
    <main className="page max-w-7xl space-y-4">
      <PageHeader title="Geteilt" subtitle="Sammlungen, die Freunde mit dir teilen" />
      {/* Wessen Sammlung? */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Geteilte Sammlungen">
        {owners.length > 1 && (
          <button
            role="tab"
            aria-selected={allMode}
            onClick={() => !allMode && void load(ALL)}
            className={`chip h-10 ${allMode ? "chip-active" : ""}`}
          >
            <span aria-hidden>👥</span> Alle Freunde
          </button>
        )}
        {owners.map((o) => {
          const on = o.owner_id === selected;
          return (
            <button
              key={o.owner_id}
              role="tab"
              aria-selected={on}
              onClick={() => !on && void load(o.owner_id)}
              title={o.owner_email}
              className={`chip h-10 pl-1.5 ${on ? "chip-active" : ""}`}
            >
              <span className="grid place-items-center w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-500 text-xs font-semibold uppercase text-white">
                {o.owner_email[0]}
              </span>
              {displayName(o.owner_email)}
            </button>
          );
        })}
      </div>

      {!selected ? (
        <p className="surface p-4 text-sm text-zinc-400">Wähle oben, wessen Sammlung du ansehen möchtest.</p>
      ) : (
        <>
          {/* Kopfbereich wie in der eigenen Sammlung */}
          <header className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/25 via-zinc-900/80 to-fuchsia-500/10 p-5 shadow-card">
            <span className="pointer-events-none absolute -z-10 -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-500/25 blur-3xl" aria-hidden />
            <h1 className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-200/80 truncate">
              {allMode ? `Alle Freunde (${owners.length})` : `Sammlung von ${owner ? displayName(owner.owner_email) : ""}`}
              <span className="ml-2 normal-case tracking-normal font-normal text-zinc-400">· nur Ansicht</span>
            </h1>
            <p className="mt-1 text-[2.4rem] leading-none sm:text-5xl font-bold tracking-tight tabular-nums text-gradient">
              {loading ? "…" : formatEur(value)}
            </p>
            {filtered.length !== cards.length && <p className="text-xs text-zinc-500 mt-1">Wert der gefilterten Karten</p>}
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center sm:max-w-md">
              <Stat
                label="Karten"
                value={filtered.length === cards.length ? `${count(cards)}` : `${count(filtered)}/${count(cards)}`}
              />
              <Stat label="Einträge" value={filtered.length === cards.length ? `${cards.length}` : `${filtered.length}/${cards.length}`} />
              <Stat label="Sets" value={`${sets.length}`} />
            </dl>
          </header>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {allMode && notSharing.length > 0 && (
            <p className="text-xs text-zinc-500">
              Nicht dabei: {notSharing.join(", ")} – {notSharing.length === 1 ? "hat" : "haben"} die Sammlung noch nicht für dich freigegeben.
            </p>
          )}

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3" aria-label="Lade Sammlung">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="aspect-[63/88] rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 px-4 py-3 bg-[#0b0b10]">
                <Filters state={filters} onChange={setFilters} sets={sets} />
              </div>
              {ownedCounts && (
                <div className="flex items-center justify-between gap-3 -mt-1">
                  <p className="text-xs text-zinc-400">
                    <span className="inline-block rounded bg-emerald-600/90 px-1 text-[10px] font-semibold text-white mr-1">✓</span>
                    = hast du selbst
                    {deckUses && Object.keys(deckUses).length > 0 && (
                      <>
                        {" · "}
                        <span className="inline-flex align-[-2px] rounded bg-indigo-600/90 px-0.5 py-px text-white mr-1" aria-hidden>
                          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zM9 2h8a2 2 0 012 2" />
                          </svg>
                        </span>= in deinem Deck
                      </>
                    )}
                    {" · "}
                    {missingCount} {missingCount === 1 ? "Eintrag fehlt" : "Einträge fehlen"} dir
                  </p>
                  <button
                    onClick={() => setOnlyMissing((v) => !v)}
                    aria-pressed={onlyMissing}
                    className={`chip h-8 text-xs shrink-0 ${onlyMissing ? "chip-active" : ""}`}
                  >
                    Nur fehlende
                  </button>
                </div>
              )}
              {onlyMissing && filtered.length === 0 && cards.length > 0 && (
                <p className="surface p-4 text-sm text-zinc-400">Hier fehlt dir nichts – du hast alle passenden Karten schon selbst.</p>
              )}
              <CardGrid
                key={selected}
                cards={filtered}
                groupBy={filters.group}
                readOnly
                owned={ownedCounts}
                deckUses={deckUses}
                ownerLabels={ownerLabels}
                selectAction={{ label: "Zum Trade", onRun: addCards }}
                detailActions={(card) => {
                  const inBasket = basketOf(card.user_id).find((b) => b.card.id === card.id)?.qty ?? 0;
                  const full = inBasket >= card.quantity;
                  const mine = own ? ownedFor(own, card) : null;
                  return (
                    <>
                    {ownerLabels && (
                      <p className="w-full rounded-xl px-3 py-2 text-sm bg-sky-500/10 border border-sky-400/25 text-sky-200">
                        Gehört {ownerLabels[card.id]} · {card.quantity}× · Trade geht an {ownerLabels[card.id]}
                      </p>
                    )}
                    {mine && (
                      <p className={`w-full rounded-xl px-3 py-2 text-sm ${mine.any ? "bg-emerald-500/10 border border-emerald-400/25 text-emerald-200" : "bg-white/[0.04] border border-white/10 text-zinc-400"}`}>
                        {mine.any ? "✓ " : ""}{ownedText(mine)}
                      </p>
                    )}
                    <button onClick={() => addCards([card])} disabled={full} className="btn-primary h-10 w-full">
                      {inBasket ? (full ? `Im Trade (${inBasket}×) ✓` : `Im Trade (${inBasket}×) · noch eine`) : "🔁 Für Trade anfragen"}
                    </button>
                    </>
                  );
                }}
              />
            </>
          )}
        </>
      )}
      {/* Trade-Leiste: was schon für den Trade gewählt ist – je Freund ein eigener Trade */}
      {barOwners.length === 1 && composerFor === null && (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-40 mx-auto max-w-md animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)]">
          <button
            onClick={() => setComposerFor(barOwners[0].owner_id)}
            className="press w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 px-4 py-3 text-left shadow-glow ring-1 ring-inset ring-white/20"
          >
            <span className="text-xl" aria-hidden>
              🔁
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold truncate">Trade mit {displayName(barOwners[0].owner_email)}</span>
              <span className="block text-xs text-white/80 tabular-nums">
                {basketCount(basketOf(barOwners[0].owner_id))} {basketCount(basketOf(barOwners[0].owner_id)) === 1 ? "Karte" : "Karten"} · {formatEur(basketValue(basketOf(barOwners[0].owner_id)))}
              </span>
            </span>
            <span className="text-sm font-semibold">Weiter ›</span>
          </button>
        </div>
      )}
      {barOwners.length > 1 && composerFor === null && (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-40 mx-auto max-w-md rounded-2xl bg-zinc-900/95 backdrop-blur ring-1 ring-inset ring-white/15 shadow-glow p-2 space-y-1.5 animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)]">
          <p className="px-2 pt-1 text-xs text-zinc-300">
            🔁 Auf {barOwners.length} Trades verteilt – je Freund einzeln abschicken
          </p>
          {barOwners.map((o) => {
            const b = basketOf(o.owner_id);
            return (
              <button
                key={o.owner_id}
                onClick={() => setComposerFor(o.owner_id)}
                className="press w-full flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 px-3 py-2 text-left ring-1 ring-inset ring-white/20"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{displayName(o.owner_email)}</span>
                <span className="text-xs text-white/85 tabular-nums whitespace-nowrap">
                  {basketCount(b)} {basketCount(b) === 1 ? "Karte" : "Karten"} · {formatEur(basketValue(b))}
                </span>
                <span className="text-sm font-semibold">›</span>
              </button>
            );
          })}
        </div>
      )}
      {toast && (
        <div
          className={`fixed inset-x-0 ${barOwners.length > 1 ? "bottom-[calc(15rem+env(safe-area-inset-bottom))] lg:bottom-52" : "bottom-[calc(10rem+env(safe-area-inset-bottom))] lg:bottom-24"} z-[80] flex justify-center px-4 pointer-events-none`}
          role="status"
        >
          <span className="rounded-full bg-zinc-800 border border-white/10 px-4 py-2 text-sm shadow-lg animate-fade-up">{toast}</span>
        </div>
      )}
      {composerOwner && (
        <TradeComposer
          partner={{ id: composerOwner.owner_id, name: displayName(composerOwner.owner_email) }}
          receive={basketOf(composerOwner.owner_id)}
          onReceiveChange={(b) => setBasketFor(composerOwner.owner_id, b)}
          onClose={() => setComposerFor(null)}
          onSent={() => setBasketFor(composerOwner.owner_id, [])}
        />
      )}
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
