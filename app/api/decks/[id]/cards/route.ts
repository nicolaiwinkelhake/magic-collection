import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardsByNames, getPrices } from "@/lib/scryfall";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!deck) {
    return NextResponse.json({ error: "Deck nicht gefunden" }, { status: 404 });
  }

  const body = await request.json();

  // Pfad 1: Scryfall-IDs aus CSV-Import
  if (body.entries?.length) {
    const entries: Array<{ scryfallId: string; name: string; quantity: number; foil: boolean }> = body.entries;
    const SCRYFALL_BASE = "https://api.scryfall.com";
    const CHUNK = 75;
    const scryfallMap = new Map<string, Record<string, unknown>>();

    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "MagicCollectionApp/1.0" },
        body: JSON.stringify({ identifiers: chunk.map((e) => ({ id: e.scryfallId })) }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const card of (data.data ?? []) as Record<string, unknown>[]) {
        scryfallMap.set(card.id as string, card);
      }
      if (i + CHUNK < entries.length) await new Promise((r) => setTimeout(r, 100));
    }

    const { data: existingCards } = await supabase
      .from("deck_cards").select("scryfall_id").eq("deck_id", params.id);
    const existingIds = new Set((existingCards ?? []).map((c) => c.scryfall_id));

    const duplicates: string[] = [];
    const rowsToInsert: Record<string, unknown>[] = [];

    for (const entry of entries) {
      const card = scryfallMap.get(entry.scryfallId);
      if (!card) continue;
      if (existingIds.has(entry.scryfallId)) { duplicates.push(card.name as string); continue; }
      const imageUris = card.image_uris as Record<string, string> | undefined;
      const cardFaces = card.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
      const imageUrl = imageUris?.normal ?? cardFaces?.[0]?.image_uris?.normal ?? null;
      const rawPrices = card.prices as Record<string, string | null> | undefined;
      const eur = rawPrices?.eur ? parseFloat(rawPrices.eur) : null;
      const eurFoil = rawPrices?.eur_foil ? parseFloat(rawPrices.eur_foil) : null;
      rowsToInsert.push({
        deck_id: params.id, user_id: user.id,
        scryfall_id: card.id, name: card.name, image_url: imageUrl,
        mana_cost: (card.mana_cost as string | null) ?? null,
        cmc: card.cmc, type_line: card.type_line,
        colors: (card.colors as string[]) ?? [],
        oracle_text: (card.oracle_text as string | null) ?? null,
        is_commander: false, price_eur: eur, price_eur_foil: eurFoil,
      });
    }

    let inserted = 0;
    if (rowsToInsert.length) {
      const { data: insertedData, error: insertError } = await supabase.from("deck_cards").insert(rowsToInsert).select("id");
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      inserted = insertedData?.length ?? 0;
      const collectionRows = entries
        .filter((e) => scryfallMap.has(e.scryfallId) && !existingIds.has(e.scryfallId))
        .map((e) => {
          const card = scryfallMap.get(e.scryfallId)!;
          const imageUris = card.image_uris as Record<string, string> | undefined;
          const cardFaces = card.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
          const imageUrl = imageUris?.normal ?? cardFaces?.[0]?.image_uris?.normal ?? null;
          const rawPrices = card.prices as Record<string, string | null> | undefined;
          return {
            user_id: user.id, scryfall_id: card.id, name: card.name, image_url: imageUrl,
            mana_cost: (card.mana_cost as string | null) ?? null,
            cmc: card.cmc, type_line: card.type_line,
            colors: (card.colors as string[]) ?? [],
            oracle_text: (card.oracle_text as string | null) ?? null,
            rarity: card.rarity as string, set_code: card.set as string,
            collector_number: card.collector_number as string,
            quantity: e.quantity, foil: e.foil,
            price_eur: rawPrices?.eur ? parseFloat(rawPrices.eur) : null,
            price_eur_foil: rawPrices?.eur_foil ? parseFloat(rawPrices.eur_foil) : null,
            price_updated_at: new Date().toISOString(),
          };
        });
      await supabase.from("cards").upsert(collectionRows, { onConflict: "user_id,scryfall_id,foil", ignoreDuplicates: true });
    }
    const notFound = entries.filter((e) => !scryfallMap.has(e.scryfallId)).map((e) => e.name);
    return NextResponse.json({ inserted, notFound, duplicates });
  }

  // Pfad 2: Kartennamen (Textimport)
  const rawNames: string[] = body.names ?? [];

  // Set-Code, Collector-Number und Kategorie-Tags serverseitig entfernen
  const names = rawNames
    .map((n) =>
      n
        .replace(/\s*\([a-z0-9]+\)\s*\d*\s*/gi, " ")
        .replace(/\s*\[[^\]]*\]/g, "")
        .trim()
    )
    .filter(Boolean);

  if (!names.length) {
    return NextResponse.json({ error: "Keine Kartennamen übergeben" }, { status: 400 });
  }

  const results = await fetchCardsByNames(names);

  // Bereits vorhandene Scryfall-IDs im Deck laden, um Duplikate zu verhindern
  const { data: existingCards } = await supabase
    .from("deck_cards")
    .select("scryfall_id")
    .eq("deck_id", params.id);
  const existingIds = new Set((existingCards ?? []).map((c) => c.scryfall_id));

  const duplicates: string[] = [];
  const rowsToInsert = results
    .filter((r) => {
      if (!r.card) return false;
      if (existingIds.has(r.card.id)) {
        duplicates.push(r.card.name);
        return false;
      }
      return true;
    })
    .map((r) => {
      const { eur, eurFoil } = getPrices(r.card!);
      return {
        deck_id: params.id,
        user_id: user.id,
        scryfall_id: r.card!.id,
        name: r.card!.name,
        image_url: r.imageUrl,
        mana_cost: r.card!.mana_cost ?? null,
        cmc: r.card!.cmc,
        type_line: r.card!.type_line,
        colors: r.card!.colors ?? [],
        oracle_text: r.card!.oracle_text ?? null,
        is_commander: false,
        price_eur: eur,
        price_eur_foil: eurFoil,
      };
    });

  let inserted = 0;
  if (rowsToInsert.length) {
    const { error, data } = await supabase
      .from("deck_cards")
      .insert(rowsToInsert)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inserted = data?.length ?? rowsToInsert.length;

    // Karten auch in die Sammlung des Nutzers eintragen (falls noch nicht vorhanden)
    const collectionRows = results
      .filter((r) => r.card && !existingIds.has(r.card.id))
      .map((r) => {
        const { eur, eurFoil } = getPrices(r.card!);
        return {
          user_id: user.id,
          scryfall_id: r.card!.id,
          name: r.card!.name,
          image_url: r.imageUrl,
          mana_cost: r.card!.mana_cost ?? null,
          cmc: r.card!.cmc,
          type_line: r.card!.type_line,
          colors: r.card!.colors ?? [],
          oracle_text: r.card!.oracle_text ?? null,
          rarity: r.card!.rarity,
          set_code: r.card!.set,
          collector_number: r.card!.collector_number,
          quantity: 1,
          foil: false,
          price_eur: eur,
          price_eur_foil: eurFoil,
          price_updated_at: new Date().toISOString(),
        };
      });
    await supabase
      .from("cards")
      .upsert(collectionRows, { onConflict: "user_id,scryfall_id,foil", ignoreDuplicates: true });

    // Preisverlauf je Karte festhalten
    for (const r of rowsToInsert) {
      await supabase.rpc("record_card_price", {
        p_scryfall_id: r.scryfall_id,
        p_eur: r.price_eur,
        p_eur_foil: r.price_eur_foil,
      });
    }
  }

  const notFound = results.filter((r) => !r.card).map((r) => r.name);

  return NextResponse.json({ inserted, notFound, duplicates });
}

// Einzelne Deckkarte entfernen (der Commander kann nicht gelöscht werden).
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { cardId } = await request.json();
  const { error } = await supabase
    .from("deck_cards")
    .delete()
    .eq("id", cardId)
    .eq("deck_id", params.id)
    .eq("user_id", user.id)
    .eq("is_commander", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
