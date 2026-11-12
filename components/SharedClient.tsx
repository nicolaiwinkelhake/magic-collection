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
import { addToBasket, basketCount, basketValue, type Basket } from "@/lib/tradeBasket";

// Geteilte Sammlungen von Freunden – gleiche Darstellung wie die eigene
// Sammlung (Wert-Kopf, Filter, Sortieren/Gruppieren, Liste/Raster/Details,
// wischbares Kartendetail), aber nur zum Ansehen. Karten lassen sich direkt
// für einen Trade anfragen (Kartendetail oder Mehrfachauswahl).

type Owner = { owner_id: string; owner_email: string };

const LAST_KEY = "shared-owner";
const displayName = (email: string) => email.split("@")[0];

export function SharedClient({ owners }: { owners: Owner[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<string>("");
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  // Trade-Korb je Freund (bleibt beim Wechseln zwischen Freunden erhalten)
  const [baskets, setBaskets] = useState<Record<string, Basket>>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const basket = baskets[selected] ?? [];
  const setBasket = (b: Basket) => setBaskets((all) => ({ ...all, [selected]: b }));
  function addCards(list: Card[]) {
    setBasket(addToBasket(basket, list));
    setToast(list.length === 1 ? `„${list[0].name}“ zum Trade hinzugefügt` : `${list.length} Karten zum Trade hinzugefügt`);
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
    const data = await selectAll<Card>(() =>
      supabase.rpc("shared_collection", { p_owner: ownerId }).order("name").order("id"),
    ).catch(() => null);
    if (data) setCards(data);
    else setError("Sammlung konnte nicht geladen werden.");
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
    const pick = owners.find((o) => o.owner_id === last)?.owner_id ?? (owners.length === 1 ? owners[0].owner_id : "");
    if (pick) void load(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => filterAndSortCards(cards, filters), [cards, filters]);
  const sets = useMemo(() => setCodes(cards), [cards]);
  const value = useMemo(() => totalValue(filtered), [filtered]);
  const count = (list: Card[]) => list.reduce((s, c) => s + (c.quantity ?? 1), 0);
  const owner = owners.find((o) => o.owner_id === selected);

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
              Sammlung von {owner ? displayName(owner.owner_email) : ""}
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

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3" aria-label="Lade Sammlung">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="aspect-[63/88] rounded-lg bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 px-4 py-3 bg-[#0b0b10]/95">
                <Filters state={filters} onChange={setFilters} sets={sets} />
              </div>
              <CardGrid
                key={selected}
                cards={filtered}
                groupBy={filters.group}
                readOnly
                selectAction={{ label: "Zum Trade", onRun: addCards }}
                detailActions={(card) => {
                  const inBasket = basket.find((b) => b.card.id === card.id)?.qty ?? 0;
                  const full = inBasket >= card.quantity;
                  return (
                    <button onClick={() => addCards([card])} disabled={full} className="btn-primary h-10 w-full">
                      {inBasket ? (full ? `Im Trade (${inBasket}×) ✓` : `Im Trade (${inBasket}×) · noch eine`) : "🔁 Für Trade anfragen"}
                    </button>
                  );
                }}
              />
            </>
          )}
        </>
      )}
      {/* Trade-Leiste: was schon für den Trade gewählt ist */}
      {owner && basket.length > 0 && !composerOpen && (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-40 mx-auto max-w-md animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)]">
          <button
            onClick={() => setComposerOpen(true)}
            className="press w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 px-4 py-3 text-left shadow-glow ring-1 ring-inset ring-white/20"
          >
            <span className="text-xl" aria-hidden>
              🔁
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold truncate">Trade mit {displayName(owner.owner_email)}</span>
              <span className="block text-xs text-white/80 tabular-nums">
                {basketCount(basket)} {basketCount(basket) === 1 ? "Karte" : "Karten"} · {formatEur(basketValue(basket))}
              </span>
            </span>
            <span className="text-sm font-semibold">Weiter ›</span>
          </button>
        </div>
      )}
      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(10rem+env(safe-area-inset-bottom))] lg:bottom-24 z-[80] flex justify-center px-4 pointer-events-none" role="status">
          <span className="rounded-full bg-zinc-800 border border-white/10 px-4 py-2 text-sm shadow-lg animate-fade-up">{toast}</span>
        </div>
      )}
      {composerOpen && owner && (
        <TradeComposer
          partner={{ id: owner.owner_id, name: displayName(owner.owner_email) }}
          receive={basket}
          onReceiveChange={setBasket}
          onClose={() => setComposerOpen(false)}
          onSent={() => setBasket([])}
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
