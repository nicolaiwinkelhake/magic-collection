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

  // Bestehende Deckliste ersetzen statt ergänzen: alte (Nicht-Commander-)
  // Deckkarten entfernen und ihre Menge aus der Sammlung wieder abziehen,
  // bevor die neue Liste importiert wird. Verhindert doppelt gezählte
  // Mengen bei versehentlichem erneutem Import derselben/geänderten Liste.
  if (body.replace) {
    const { data: oldCards } = await supabase
      .from("deck_cards")
      .select("id, scryfall_id")
      .eq("deck_id", params.id)
      .eq("user_id", user.id)
      .eq("is_commander", false);

    if (oldCards?.length) {
      const oldQtyByScryfallId = new Map<string, number>();
      for (const c of oldCards) {
        oldQtyByScryfallId.set(c.scryfall_id, (oldQtyByScryfallId.get(c.scryfall_id) ?? 0) + 1);
      }

      const { data: collectionRowsForDeck } = await supabase
        .from("cards")
        .select("id, scryfall_id, quantity")
        .eq("user_id", user.id)
        .eq("foil", false)
        .in("scryfall_id", Array.from(oldQtyByScryfallId.keys()));

      for (const row of collectionRowsForDeck ?? []) {
        const oldQty = oldQtyByScryfallId.get(row.scryfall_id) ?? 0;
        const newQty = row.quantity - oldQty;
        if (newQty <= 0) {
          await supabase.from("cards").delete().eq("id", row.id);
        } else {
          await supabase.from("cards").update({ quantity: newQty }).eq("id", row.id);
        }
      }

      await supabase
        .from("deck_cards")
        .delete()
        .eq("deck_id", params.id)
        .eq("user_id", user.id)
        .eq("is_commander", false);
    }
  }

  // Pfad 1: Scryfall-IDs aus CSV-Import (Mengenangabe pro Zeile wird respektiert)
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

    const rowsToInsert: Record<string, unknown>[] = [];
    // Zählt Mengen pro Karte, um mehrfach vorkommende Karten (z.B. Basic Lands) zu melden
    const qtyByCard = new Map<string, { name: string; qty: number }>();

    for (const entry of entries) {
      const card = scryfallMap.get(entry.scryfallId);
      if (!card) continue;
      const qty = Math.max(1, entry.quantity || 1);
      const prev = qtyByCard.get(entry.scryfallId);
      qtyByCard.set(entry.scryfallId, { name: card.name as string, qty: (prev?.qty ?? 0) + qty });

      const imageUris = card.image_uris as Record<string, string> | undefined;
      const cardFaces = card.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
      const imageUrl = imageUris?.normal ?? cardFaces?.[0]?.image_uris?.normal ?? null;
      const rawPrices = card.prices as Record<string, string | null> | undefined;
      const eur = rawPrices?.eur ? parseFloat(rawPrices.eur) : null;
      const eurFoil = rawPrices?.eur_foil ? parseFloat(rawPrices.eur_foil) : null;

      for (let i = 0; i < qty; i++) {
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
    }

    const repeated = Array.from(qtyByCard.values())
      .filter((v) => v.qty > 1)
      .map((v) => ({ name: v.name, count: v.qty }));

    let inserted = 0;
    if (rowsToInsert.length) {
      const { data: insertedData, error: insertError } = await supabase.from("deck_cards").insert(rowsToInsert).select("id");
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      inserted = insertedData?.length ?? 0;

      const relevantIds = Array.from(new Set(entries.filter((e) => scryfallMap.has(e.scryfallId)).map((e) => e.scryfallId)));
      const { data: existingRows } = await supabase
        .from("cards")
        .select("scryfall_id,foil,quantity")
        .eq("user_id", user.id)
        .in("scryfall_id", relevantIds);
      const existingQtyByKey = new Map<string, number>(
        (existingRows ?? []).map((r) => [`${r.scryfall_id}_${r.foil}`, r.quantity as number])
      );

      const collectionRows = entries
        .filter((e) => scryfallMap.has(e.scryfallId))
        .map((e) => {
          const card = scryfallMap.get(e.scryfallId)!;
          const imageUris = card.image_uris as Record<string, string> | undefined;
          const cardFaces = card.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
          const imageUrl = imageUris?.normal ?? cardFaces?.[0]?.image_uris?.normal ?? null;
          const rawPrices = card.prices as Record<string, string | null> | undefined;
          const key = `${e.scryfallId}_${e.foil}`;
          const priorQty = existingQtyByKey.get(key) ?? 0;
          existingQtyByKey.set(key, priorQty + e.quantity);
          return {
            user_id: user.id, scryfall_id: card.id, name: card.name, image_url: imageUrl,
            mana_cost: (card.mana_cost as string | null) ?? null,
            cmc: card.cmc, type_line: card.type_line,
            colors: (card.colors as string[]) ?? [],
            oracle_text: (card.oracle_text as string | null) ?? null,
            rarity: card.rarity as string, set_code: card.set as string,
            collector_number: card.collector_number as string,
            quantity: priorQty + e.quantity, foil: e.foil,
            price_eur: rawPrices?.eur ? parseFloat(rawPrices.eur) : null,
            price_eur_foil: rawPrices?.eur_foil ? parseFloat(rawPrices.eur_foil) : null,
            price_updated_at: new Date().toISOString(),
          };
        });
      await supabase.from("cards").upsert(collectionRows, { onConflict: "user_id,scryfall_id,foil" });
    }
    const notFound = entries.filter((e) => !scryfallMap.has(e.scryfallId)).map((e) => e.name);
    return NextResponse.json({ inserted, notFound, repeated });
  }

  // Pfad 2: Kartennamen (Textimport) – Mengenangabe wie "6x Island" wird respektiert
  const rawEntries: Array<{ name: string; quantity?: number }> =
    body.nameEntries ?? (body.names ?? []).map((n: string) => ({ name: n, quantity: 1 }));

  // Set-Code, Collector-Number und Kategorie-Tags serverseitig entfernen
  const cleaned = rawEntries
    .map((e) => ({
      name: e.name
        .replace(/\s*\([a-z0-9]+\)\s*\d*\s*/gi, " ")
        .replace(/\s*\[[^\]]*\]/g, "")
        .trim(),
      quantity: Math.max(1, e.quantity ?? 1),
    }))
    .filter((e) => e.name.length > 0);

  if (!cleaned.length) {
    return NextResponse.json({ error: "Keine Kartennamen übergeben" }, { status: 400 });
  }

  // Mengen gleicher Kartennamen zusammenzählen (z.B. mehrere Zeilen mit "Island")
  const qtyByName = new Map<string, number>();
  for (const e of cleaned) {
    const key = e.name.toLowerCase();
    qtyByName.set(key, (qtyByName.get(key) ?? 0) + e.quantity);
  }

  const uniqueNames = Array.from(new Set(cleaned.map((e) => e.name)));
  const results = await fetchCardsByNames(uniqueNames);
  const resultByName = new Map(results.map((r) => [r.name.toLowerCase(), r]));

  const rowsToInsert: Record<string, unknown>[] = [];
  const repeated: { name: string; count: number }[] = [];
  const priceRecords: { scryfall_id: string; eur: number | null; eurFoil: number | null }[] = [];
  const collectionRows: Record<string, unknown>[] = [];

  for (const [nameKey, qty] of qtyByName) {
    const r = resultByName.get(nameKey);
    if (!r || !r.card) continue;
    const { eur, eurFoil } = getPrices(r.card);
    if (qty > 1) repeated.push({ name: r.card.name, count: qty });

    for (let i = 0; i < qty; i++) {
      rowsToInsert.push({
        deck_id: params.id,
        user_id: user.id,
        scryfall_id: r.card.id,
        name: r.card.name,
        image_url: r.imageUrl,
        mana_cost: r.card.mana_cost ?? null,
        cmc: r.card.cmc,
        type_line: r.card.type_line,
        colors: r.card.colors ?? [],
        oracle_text: r.card.oracle_text ?? null,
        is_commander: false,
        price_eur: eur,
        price_eur_foil: eurFoil,
      });
    }

    priceRecords.push({ scryfall_id: r.card.id, eur, eurFoil });

    collectionRows.push({
      user_id: user.id,
      scryfall_id: r.card.id,
      name: r.card.name,
      image_url: r.imageUrl,
      mana_cost: r.card.mana_cost ?? null,
      cmc: r.card.cmc,
      type_line: r.card.type_line,
      colors: r.card.colors ?? [],
      oracle_text: r.card.oracle_text ?? null,
      rarity: r.card.rarity,
      set_code: r.card.set,
      collector_number: r.card.collector_number,
      quantity: qty,
      foil: false,
      price_eur: eur,
      price_eur_foil: eurFoil,
      price_updated_at: new Date().toISOString(),
    });
  }

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

    // Karten auch in die Sammlung des Nutzers eintragen; bestehende Menge wird addiert
    // statt bei Konflikt ignoriert zu werden (sonst zählen Karten aus mehreren Decks nicht doppelt)
    const relevantIds = Array.from(new Set(collectionRows.map((r) => r.scryfall_id as string)));
    const { data: existingRows } = await supabase
      .from("cards")
      .select("scryfall_id,foil,quantity")
      .eq("user_id", user.id)
      .in("scryfall_id", relevantIds);
    const existingQtyByKey = new Map<string, number>(
      (existingRows ?? []).map((r) => [`${r.scryfall_id}_${r.foil}`, r.quantity as number])
    );
    for (const row of collectionRows) {
      const key = `${row.scryfall_id}_${row.foil}`;
      row.quantity = (existingQtyByKey.get(key) ?? 0) + (row.quantity as number);
    }
    await supabase
      .from("cards")
      .upsert(collectionRows, { onConflict: "user_id,scryfall_id,foil" });

    // Preisverlauf je Karte festhalten (einmal pro Karte, unabhängig von der Menge)
    for (const p of priceRecords) {
      await supabase.rpc("record_card_price", {
        p_scryfall_id: p.scryfall_id,
        p_eur: p.eur,
        p_eur_foil: p.eurFoil,
      });
    }
  }

  const notFound = uniqueNames.filter((n) => !resultByName.get(n.toLowerCase())?.card);

  return NextResponse.json({ inserted, notFound, repeated });
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
