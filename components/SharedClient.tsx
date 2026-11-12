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

// Geteilte Sammlungen von Freunden – gleiche Darstellung wie die eigene
// Sammlung (Wert-Kopf, Filter, Sortieren/Gruppieren, Liste/Raster/Details,
// wischbares Kartendetail), aber nur zum Ansehen.

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
              <CardGrid key={selected} cards={filtered} groupBy={filters.group} readOnly />
            </>
          )}
        </>
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
