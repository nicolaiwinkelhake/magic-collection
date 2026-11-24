import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { COLLECTION_PACE_MS, fetchCollectionWithRetry, getPrices, sleep } from "@/lib/scryfall";
import { cardValue } from "@/lib/valuation";
import { catalogCardmarketIds, catalogPrices } from "@/lib/catalogLookup";
import { applyTrendPrices, fetchPriceGuide } from "@/lib/cardmarket";

export const maxDuration = 300;

const SCRYFALL_CHUNK = 75;
const PAGE = 1000; // PostgREST liefert höchstens 1000 Zeilen je Abfrage
const APPLY_CHUNK = 500;

// Alle Zeilen einer Abfrage seitenweise laden. Ohne Blättern schneidet
// Supabase bei 1000 Zeilen ab – dann fehlten Karten und die Tageswerte der
// Sammlungen wären falsch.
async function selectAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} konnte nicht gelesen werden: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

// Nächtlicher Preis-Job: aktualisiert Kartenpreise für ALLE Nutzer über den
// Scryfall-Batch-Endpoint, schreibt den globalen Preisverlauf und die
// Tages-Snapshots für Sammlungen und Decks. Läuft mit Service-Role (umgeht
// RLS) und ist durch ein Bearer-Secret geschützt (Vercel Cron sendet
// automatisch "Authorization: Bearer $CRON_SECRET").
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // 1) Alle Drucke (aller Nutzer), seitenweise
    const cards = await selectAll<{
      user_id: string;
      scryfall_id: string;
      quantity: number;
      foil: boolean;
      condition: string;
      price_eur: number | null;
      price_eur_foil: number | null;
    }>(supabase, "cards", "id, user_id, scryfall_id, quantity, foil, condition, price_eur, price_eur_foil");
    // auch Deck-Karten und Wunschliste (nicht nur, was in Sammlungen liegt)
    const [deckIds, wishIds] = await Promise.all([
      selectAll<{ scryfall_id: string | null }>(supabase, "deck_cards", "id, scryfall_id"),
      selectAll<{ scryfall_id: string | null }>(supabase, "wishlist", "id, scryfall_id"),
    ]);
    // … und Karten in offenen Trades (deren Wert soll tagesaktuell sein)
    const tradeIds: string[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("trade_items")
        .select("id, scryfall_id, trades!inner(status)")
        .eq("trades.status", "pending")
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`trade_items konnte nicht gelesen werden: ${error.message}`);
      tradeIds.push(...(data ?? []).map((r) => r.scryfall_id as string));
      if (!data || data.length < PAGE) break;
    }
    const uniqueIds = Array.from(
      new Set(
        [...cards.map((c) => c.scryfall_id), ...deckIds.map((d) => d.scryfall_id), ...wishIds.map((w) => w.scryfall_id), ...tradeIds].filter(
          (x): x is string => !!x,
        ),
      ),
    );

    // 2) Preise: Cardmarket-Trendpreise direkt aus Cardmarkets Preisliste
    //    (tagesaktuell). Was dort fehlt: aus dem eigenen Katalog (täglich aus Scryfalls
    //    Gesamtdatei – derselbe Tagesstand wie die Einzelabfrage); nur was
    //    dort fehlt (oder wenn der Katalog nicht frisch ist), gebündelt bei
    //    Scryfall – im erlaubten Tempo (≈2/s), fehlgeschlagene Blöcke ein
    //    zweites Mal.
    const prices = new Map<string, { eur: number | null; eurFoil: number | null }>();
    const fromCatalog = await catalogPrices(uniqueIds);
    for (const id of uniqueIds) {
      const p = fromCatalog.get(id.toLowerCase());
      if (p) prices.set(id, p);
    }
    // Cardmarket-Preisliste parallel laden; Produktnummern aus dem Katalog
    const guidePromise = fetchPriceGuide().catch((e: unknown) => e as Error);
    const cardmarketIds = new Map<string, number>();
    const cmFromCatalog = await catalogCardmarketIds(uniqueIds);
    for (const id of uniqueIds) {
      const cm = cmFromCatalog.get(id.toLowerCase());
      if (cm) cardmarketIds.set(id, cm);
    }
    const restIds = uniqueIds.filter((id) => !prices.has(id));
    const chunks: string[][] = [];
    for (let i = 0; i < restIds.length; i += SCRYFALL_CHUNK) chunks.push(restIds.slice(i, i + SCRYFALL_CHUNK));
    let failed: string[][] = [];
    for (let round = 0; round < 2; round++) {
      const todo = round === 0 ? chunks : failed;
      failed = [];
      for (let i = 0; i < todo.length; i++) {
        const found = await fetchCollectionWithRetry(todo[i].map((id) => ({ id })));
        if (found === null) failed.push(todo[i]);
        for (const card of found ?? []) {
          prices.set(card.id, getPrices(card));
          if (card.cardmarket_id && !cardmarketIds.has(card.id)) cardmarketIds.set(card.id, card.cardmarket_id);
        }
        if (i + 1 < todo.length) await sleep(COLLECTION_PACE_MS);
      }
      if (!failed.length) break;
    }
    const scryfallFailures = failed.length;

    // Trendpreise von Cardmarket drüberlegen (ohne Preisliste bleibt es beim
    // Scryfall-Stand vom Vortag)
    const guide = await guidePromise;
    let fromCardmarket = 0;
    let cardmarketError: string | null = null;
    if (guide instanceof Error) cardmarketError = guide.message;
    else fromCardmarket = applyTrendPrices(prices, cardmarketIds, guide.prices);

    // 3) Gesammelt schreiben (Preisverlauf, cards, deck_cards)
    const updates = Array.from(prices, ([id, p]) => ({ id, eur: p.eur, eur_foil: p.eurFoil }));
    for (let i = 0; i < updates.length; i += APPLY_CHUNK) {
      const { error } = await supabase.rpc("apply_card_prices", {
        p_prices: updates.slice(i, i + APPLY_CHUNK),
      });
      if (error) throw new Error(`Preise konnten nicht gespeichert werden: ${error.message}`);
    }

    // 4) Sammlungswert-Snapshot je Nutzer (zustandsbereinigt, zentrale Logik)
    const byUser = new Map<string, number>();
    for (const c of cards) {
      // Neuer Preis, sonst (Scryfall-Ausfall) der zuletzt gespeicherte.
      const p = prices.get(c.scryfall_id);
      const value = cardValue(p ? { ...c, price_eur: p.eur, price_eur_foil: p.eurFoil } : c);
      byUser.set(c.user_id, (byUser.get(c.user_id) ?? 0) + value);
    }
    if (byUser.size) {
      const { error } = await supabase.from("collection_value_history").upsert(
        Array.from(byUser, ([user_id, total]) => ({ user_id, total_value_eur: total })),
        { onConflict: "user_id,captured_on" }
      );
      if (error) throw new Error(`Sammlungs-Snapshot fehlgeschlagen: ${error.message}`);
    }

    // 5) Deckwert-Snapshot je Deck
    const deckCards = await selectAll<{ deck_id: string; price_eur: number | null }>(
      supabase,
      "deck_cards",
      "id, deck_id, price_eur"
    );
    const byDeck = new Map<string, number>();
    for (const c of deckCards) byDeck.set(c.deck_id, (byDeck.get(c.deck_id) ?? 0) + (c.price_eur ?? 0));
    if (byDeck.size) {
      const { error } = await supabase.from("deck_value_history").upsert(
        Array.from(byDeck, ([deck_id, total]) => ({ deck_id, total_value_eur: total })),
        { onConflict: "deck_id,captured_on" }
      );
      if (error) throw new Error(`Deck-Snapshot fehlgeschlagen: ${error.message}`);
    }

    const summary = {
      prints: uniqueIds.length,
      fromCatalog: uniqueIds.length - restIds.length,
      fromScryfall: restIds.length,
      fromCardmarket,
      cardmarketError,
      updatedPrints: updates.length,
      scryfallFailures,
      users: byUser.size,
      decks: byDeck.size,
    };
    console.log("Preis-Cron fertig", summary);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("Preis-Cron fehlgeschlagen", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unbekannter Fehler" },
      { status: 500 }
    );
  }
}
