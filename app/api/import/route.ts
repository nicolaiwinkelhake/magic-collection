import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, getPrices, sleep } from "@/lib/scryfall";

// Erwartet { entries: [{ name, quantity, foil? }] }.
// Karten werden über die Unique-Bedingung (user, scryfall_id, foil)
// zusammengeführt: vorhandene Mengen werden erhöht statt Duplikate anzulegen.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json();
  const entries: Array<{ name: string; quantity?: number; foil?: boolean }> =
    body.entries ?? [];

  if (!entries.length) {
    return NextResponse.json({ error: "Keine Karten übergeben" }, { status: 400 });
  }

  const notFound: string[] = [];
  let imported = 0;

  // Eindeutige Namen einmal auflösen (spart Scryfall-Requests)
  const uniqueNames = Array.from(new Set(entries.map((e) => e.name.trim())));
  const resolved = new Map<string, Awaited<ReturnType<typeof fetchCardByName>>>();

  for (const name of uniqueNames) {
    if (!name) continue;
    resolved.set(name, await fetchCardByName(name));
    await sleep(100);
  }

  for (const entry of entries) {
    const name = entry.name.trim();
    if (!name) continue;
    const r = resolved.get(name);
    const qty = Math.max(1, entry.quantity ?? 1);
    const foil = entry.foil ?? false;

    if (!r?.card) {
      if (!notFound.includes(name)) notFound.push(name);
      continue;
    }

    const { eur, eurFoil } = getPrices(r.card);

    // Vorhandene Zeile für diesen Druck + Foil-Status suchen
    const { data: existing } = await supabase
      .from("cards")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("scryfall_id", r.card.id)
      .eq("foil", foil)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("cards")
        .update({
          quantity: existing.quantity + qty,
          price_eur: eur,
          price_eur_foil: eurFoil,
          price_updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("cards").insert({
        user_id: user.id,
        scryfall_id: r.card.id,
        name: r.card.name,
        set_code: r.card.set,
        collector_number: r.card.collector_number,
        image_url: r.imageUrl,
        mana_cost: r.card.mana_cost ?? null,
        cmc: r.card.cmc,
        type_line: r.card.type_line,
        colors: r.card.colors ?? [],
        rarity: r.card.rarity,
        oracle_text: r.card.oracle_text ?? null,
        quantity: qty,
        foil,
        price_eur: eur,
        price_eur_foil: eurFoil,
        price_updated_at: new Date().toISOString(),
      });
    }

    // Preisverlauf festhalten
    await supabase.rpc("record_card_price", {
      p_scryfall_id: r.card.id,
      p_eur: eur,
      p_eur_foil: eurFoil,
    });

    imported += qty;
  }

  // Tages-Snapshot des Gesamtwerts aktualisieren
  await supabase.rpc("snapshot_collection_value");

  return NextResponse.json({ imported, notFound });
}
