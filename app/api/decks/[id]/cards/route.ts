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

  // Sicherstellen, dass das Deck dem Nutzer gehört (RLS greift zusätzlich)
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
  const rawNames: string[] = body.names ?? [];

  // Set-Code, Collector-Number und Kategorie-Tags serverseitig entfernen,
  // damit Formate wie "Sol Ring (msc) 211 [Ramp]" korrekt aufgelöst werden.
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

    // Preisverlauf je Karte festhalten (für Einzelkarten-Charts)
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
  await supabase
    .from("deck_cards")
    .delete()
    .eq("id", cardId)
    .eq("deck_id", params.id)
    .eq("user_id", user.id)
    .eq("is_commander", false);

  return NextResponse.json({ ok: true });
}
