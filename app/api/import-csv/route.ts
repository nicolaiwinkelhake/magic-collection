import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
const SCRYFALL_BASE = "https://api.scryfall.com";
const CHUNK = 75;

// Importiert Karten anhand von Scryfall-IDs (aus Moxfield-CSV).
// Erwartet { entries: [{ scryfallId, name, quantity, foil }] }.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const body = await request.json();
  const entries: Array<{ scryfallId: string; name: string; quantity: number; foil: boolean }> =
    body.entries ?? [];
  if (!entries.length) return NextResponse.json({ error: "Keine Einträge" }, { status: 400 });

  // Daten von Scryfall per Bulk-API holen (75 IDs pro Request)
  const scryfallMap = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const identifiers = chunk.map((e) => ({ id: e.scryfallId }));
    const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "MagicCollectionApp/1.0" },
      body: JSON.stringify({ identifiers }),
    });
    if (!res.ok) continue;
    const data = await res.json();
    for (const card of (data.data ?? []) as Record<string, unknown>[]) {
      scryfallMap.set(card.id as string, card);
    }
    if (i + CHUNK < entries.length) await new Promise((r) => setTimeout(r, 100));
  }

  let imported = 0;
  const notFound: string[] = [];

  for (const entry of entries) {
    const card = scryfallMap.get(entry.scryfallId);
    if (!card) {
      notFound.push(entry.name);
      continue;
    }

    const imageUris = card.image_uris as Record<string, string> | undefined;
    const cardFaces = card.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
    const imageUrl =
      imageUris?.normal ??
      cardFaces?.[0]?.image_uris?.normal ??
      null;

    const rawPrices = card.prices as Record<string, string | null> | undefined;
    const eur = rawPrices?.eur ? parseFloat(rawPrices.eur) : null;
    const eurFoil = rawPrices?.eur_foil ? parseFloat(rawPrices.eur_foil) : null;
    const prices = { eur, eurFoil };

    const row = {
      user_id: user.id,
      scryfall_id: card.id as string,
      name: card.name as string,
      set_code: card.set as string,
      collector_number: card.collector_number as string,
      image_url: imageUrl,
      mana_cost: (card.mana_cost as string | null) ?? null,
      cmc: (card.cmc as number) ?? 0,
      type_line: card.type_line as string,
      colors: (card.colors as string[]) ?? [],
      rarity: card.rarity as string,
      oracle_text: (card.oracle_text as string | null) ?? null,
      quantity: entry.quantity,
      foil: entry.foil,
      price_eur: prices.eur,
      price_eur_foil: prices.eurFoil,
      price_updated_at: new Date().toISOString(),
    };

    // Vorhandene Zeile suchen und Menge addieren
    const { data: existing } = await supabase
      .from("cards")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("scryfall_id", card.id as string)
      .eq("foil", entry.foil)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("cards")
        .update({
          quantity: existing.quantity + entry.quantity,
          price_eur: prices.eur,
          price_eur_foil: prices.eurFoil,
          price_updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("cards").insert(row);
    }

    await supabase.rpc("record_card_price", {
      p_scryfall_id: card.id as string,
      p_eur: prices.eur,
      p_eur_foil: prices.eurFoil,
    });

    imported += entry.quantity;
  }

  await supabase.rpc("snapshot_collection_value");
  return NextResponse.json({ imported, notFound });
}
