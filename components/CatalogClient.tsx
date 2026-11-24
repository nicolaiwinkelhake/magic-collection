"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "@/lib/types";
import { Filters, type FilterState } from "@/components/Filters";
import { CardGrid } from "@/components/CardGrid";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintPicker } from "@/components/ui/PrintPicker";
import { DEFAULT_FILTERS } from "@/lib/cardFilters";
import { fetchCatalogPage, PAGE_SIZE, withPrint } from "@/lib/catalogBrowse";
import { ownedFor, ownedText } from "@/lib/ownedMatch";
import { useMyCollection } from "@/lib/useMyCollection";
import { haptic } from "@/lib/haptics";

// Alle Magic-Karten durchsuchen – gleiche Filter und Darstellung wie die
// Sammlung (Suche deutsch/englisch oder im Kartentext, Farben, Seltenheit,
// Typ, Set, Sortieren, Gruppieren). Je Karte der Standarddruck; im
// Kartendetail zeigt „Versionen“ alle Drucke. Gefiltert wird in der Datenbank,
// geladen wird seitenweise.

const START: FilterState = { ...DEFAULT_FILTERS, sort: "popular" };

export function CatalogClient({ sets }: { sets: Array<{ code: string; name: string }> }) {
  const [filters, setFilters] = useState<FilterState>(START);
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // gerade hinzugefügt (Name → Anzahl), damit „hast du“ sofort stimmt
  const [added, setAdded] = useState<Record<string, number>>({});
  const seq = useRef(0);
  const [retry, setRetry] = useState(0);

  // Erste Seite bei jeder Filteränderung (beim Tippen kurz warten)
  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      const page = await fetchCatalogPage(filters, 0);
      if (mine !== seq.current) return;
      setLoading(false);
      if (!page) {
        setError("Der Katalog konnte nicht geladen werden – vielleicht war die Verbindung kurz weg.");
        return;
      }
      setCards(page.cards);
      setTotal(page.total);
    }, filters.search ? 300 : 0);
    return () => clearTimeout(t);
  }, [filters, retry]);

  const loadMore = useCallback(async () => {
    if (loading || total == null || cards.length >= total) return;
    const mine = seq.current;
    setLoading(true);
    const page = await fetchCatalogPage(filters, cards.length);
    if (mine !== seq.current) return;
    setLoading(false);
    if (page) setCards((c) => [...c, ...page.cards.filter((n) => !c.some((x) => x.id === n.id))]);
  }, [loading, total, cards.length, filters]);

  // Weiterladen, sobald das Ende der Liste in Sicht kommt
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // Was ich selbst habe (Name), plus gerade Hinzugefügtes
  const { own } = useMyCollection();
  const owned = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of cards) {
      const n = (own ? ownedFor(own, c).any : 0) + (added[c.name] ?? 0);
      if (n) out[c.id] = n;
    }
    return out;
  }, [own, cards, added]);

  async function add(list: Card[], target: "collection" | "wishlist") {
    const res = await fetch(target === "collection" ? "/api/import/batch" : "/api/wishlist/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchKey: crypto.randomUUID(),
        allowDuplicates: true,
        items: list.map((c, i) => ({ i, name: c.name, scryfallId: c.scryfall_id, quantity: 1, foil: false })),
      }),
    }).catch(() => null);
    if (!res?.ok) {
      haptic("error");
      setToast("Hinzufügen hat nicht geklappt – bitte erneut versuchen.");
      return;
    }
    const what = list.length === 1 ? `„${list[0].name}“` : `${list.length} Karten`;
    if (target === "collection") {
      setAdded((a) => {
        const next = { ...a };
        for (const c of list) next[c.name] = (next[c.name] ?? 0) + 1;
        return next;
      });
      haptic("success");
      setToast(`${what} zur Sammlung hinzugefügt`);
    } else {
      haptic("success");
      setToast(`${what} auf die Wunschliste gesetzt`);
    }
  }

  const setCodes = useMemo(() => sets.map((s) => s.code), [sets]);
  const setLabels = useMemo(() => Object.fromEntries(sets.map((s) => [s.code, s.name])), [sets]);

  return (
    <main className="page max-w-7xl space-y-4">
      <PageHeader
        title="Katalog"
        subtitle={total == null ? "Alle Magic-Karten" : `${total.toLocaleString("de-DE")} ${total === 1 ? "Karte" : "Karten"}${filters === START ? " · beliebteste zuerst" : ""}`}
      />
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 px-4 py-3 bg-[#0b0b10]">
        <Filters state={filters} onChange={setFilters} sets={setCodes} setLabels={setLabels} popularSort />
      </div>
      {error && (
        <div className="surface p-4 space-y-3">
          <p className="text-sm text-red-400">{error}</p>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="btn-secondary">
            Erneut versuchen
          </button>
        </div>
      )}
      {!error && total === 0 && !loading && <p className="surface p-4 text-sm text-zinc-400">Keine Karte passt zu dieser Suche.</p>}

      {cards.length > 0 && (
        <CardGrid
          cards={cards}
          groupBy={filters.group}
          readOnly
          noStock
          owned={owned}
          selectAction={{ label: "Zur Wunschliste", onRun: (list) => void add(list, "wishlist") }}
          detailActions={(card) => {
            const mine = own ? ownedFor(own, card) : null;
            const plus = added[card.name] ?? 0;
            return (
              <>
                {(mine || plus > 0) && (
                  <p
                    className={`w-full rounded-xl px-3 py-2 text-sm ${(mine?.any ?? 0) + plus ? "bg-emerald-500/10 border border-emerald-400/25 text-emerald-200" : "bg-white/[0.04] border border-white/10 text-zinc-400"}`}
                  >
                    {(mine?.any ?? 0) + plus ? "✓ " : ""}
                    {mine ? ownedText({ ...mine, any: mine.any + plus }) : `${plus}× in deiner Sammlung`}
                  </p>
                )}
                <button onClick={() => setVersionsFor(card)} className="btn-secondary h-10 w-full">
                  Versionen ansehen
                </button>
                <div className="grid w-full grid-cols-2 gap-2">
                  <button onClick={() => void add([card], "collection")} className="btn-primary h-10">
                    + Sammlung
                  </button>
                  <button onClick={() => void add([card], "wishlist")} className="btn-secondary h-10">
                    + Wunschliste
                  </button>
                </div>
              </>
            );
          }}
        />
      )}

      <div ref={endRef} />
      {loading && <p className="text-center text-sm text-zinc-500" aria-live="polite">Lade Karten …</p>}
      {!loading && total != null && cards.length < total && (
        <button onClick={() => void loadMore()} className="btn-secondary w-full">
          Weitere laden ({cards.length.toLocaleString("de-DE")} von {total.toLocaleString("de-DE")})
        </button>
      )}

      {versionsFor && (
        <PrintPicker
          name={versionsFor.name}
          currentId={versionsFor.scryfall_id}
          onPick={(p) => {
            // gewählte Version an Stelle der Karte zeigen (Detail, Preis, + Sammlung nimmt diesen Druck)
            setCards((list) => list.map((c) => (c.id === versionsFor.id ? withPrint(c, p) : c)));
            setVersionsFor(null);
            setToast(`Version: ${(p.set ?? "").toUpperCase()} #${p.collectorNumber ?? ""}`);
          }}
          onClose={() => setVersionsFor(null)}
        />
      )}
      {toast && (
        <div className="fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-8 z-[80] flex justify-center px-4 pointer-events-none" role="status">
          <span className="rounded-full bg-zinc-800 border border-white/10 px-4 py-2 text-sm shadow-lg animate-fade-up">{toast}</span>
        </div>
      )}
      <p className="pb-4 text-xs text-zinc-600">Kartendaten und Bilder von Scryfall, täglich aktualisiert.</p>
    </main>
  );
}
