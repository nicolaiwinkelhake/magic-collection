import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCollectionWithRetry, getPrices, sleep } from "@/lib/scryfall";
import { cardValue } from "@/lib/valuation";

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
    const uniqueIds = Array.from(new Set(cards.map((c) => c.scryfall_id)));

    // 2) Preise gebündelt bei Scryfall abrufen
    const prices = new Map<string, { eur: number | null; eurFoil: number | null }>();
    let scryfallFailures = 0;
    for (let i = 0; i < uniqueIds.length; i += SCRYFALL_CHUNK) {
      const found = await fetchCollectionWithRetry(
        uniqueIds.slice(i, i + SCRYFALL_CHUNK).map((id) => ({ id }))
      );
      if (found === null) scryfallFailures += 1;
      for (const card of found ?? []) prices.set(card.id, getPrices(card));
      if (i + SCRYFALL_CHUNK < uniqueIds.length) await sleep(100);
    }

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
