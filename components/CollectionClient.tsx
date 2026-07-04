"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Filters, type FilterState } from "@/components/Filters";
import { CardGrid } from "@/components/CardGrid";
import { ImportForm } from "@/components/ImportForm";
import { formatEur } from "@/lib/format";
import { totalValue as computeTotalValue } from "@/lib/valuation";
import type { Card } from "@/lib/types";

export function CollectionClient({
  initialCards,
  userEmail,
  loadError,
}: {
  initialCards: Card[];
  userEmail: string;
  loadError?: string;
}) {
  const router = useRouter();
  const supabase = createClient();

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
  });

  const availableSets = useMemo(() => {
    const codes = new Set<string>();
    for (const c of initialCards) if (c.set_code) codes.add(c.set_code);
    return [...codes].sort();
  }, [initialCards]);

  const filteredCards = useMemo(() => {
    const result = initialCards.filter((card) => {
      if (
        filters.search &&
        !card.name.toLowerCase().includes(filters.search.toLowerCase())
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
  }, [initialCards, filters]);

  const totalValue = useMemo(
    () => computeTotalValue(filteredCards),
    [filteredCards]
  );

  const formattedTotal = formatEur(totalValue);

  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshPrices() {
    setRefreshing(true);
    await fetch("/api/prices/refresh", { method: "POST" });
    setRefreshing(false);
    router.refresh();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {backfilling && (
        <div className="flex items-center gap-2 bg-indigo-900/40 border border-indigo-700 rounded-lg px-4 py-2 text-sm text-indigo-300">
          <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Kartendaten werden von Scryfall aktualisiert…
        </div>
      )}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">🪄 Magic Collection</h1>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <a href="/decks" className="hover:text-indigo-400">
            Decks
          </a>
          <a href="/scan" className="hover:text-indigo-400">
            Scannen
          </a>
          <a href="/wishlist" className="hover:text-indigo-400">
            Wunschliste
          </a>
          <a href="/sets" className="hover:text-indigo-400">
            Sets
          </a>
          <a href="/trades" className="hover:text-indigo-400">
            Trades
          </a>
          <a href="/loans" className="hover:text-indigo-400">
            Verliehen
          </a>
          <a href="/stats" className="hover:text-indigo-400">
            Wertverlauf
          </a>
          <a href="/friends" className="hover:text-indigo-400">
            Freunde
          </a>
          <a href="/account" className="hover:text-indigo-400">
            {userEmail}
          </a>
          <button
            onClick={handleLogout}
            className="text-red-400 hover:underline"
          >
            Abmelden
          </button>
        </div>
      </header>

      <ImportForm />

      {loadError && (
        <p className="text-red-400">Fehler beim Laden: {loadError}</p>
      )}

      <Filters state={filters} onChange={setFilters} sets={availableSets} />

      <p className="text-sm text-zinc-500 flex items-center gap-3">
        <span>
          {filteredCards.length} von {initialCards.length} Karten ·
          Gesamtwert:{" "}
          <span className="text-emerald-400 font-medium">
            {formattedTotal}
          </span>
        </span>
        <button
          onClick={handleRefreshPrices}
          disabled={refreshing}
          className="text-indigo-400 hover:underline disabled:opacity-50"
        >
          {refreshing ? "Aktualisiere Preise..." : "Preise aktualisieren"}
        </button>
        <a href="/api/export" className="text-indigo-400 hover:underline">
          CSV-Export
        </a>
      </p>

      <CardGrid cards={filteredCards} />
    </main>
  );
}
