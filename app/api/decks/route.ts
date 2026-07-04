import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, getPrices } from "@/lib/scryfall";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json();
  const { name, commanderName } = body as { name: string; commanderName: string };

  if (!name?.trim() || !commanderName?.trim()) {
    return NextResponse.json(
      { error: "Deckname und Commander-Name sind erforderlich" },
      { status: 400 }
    );
  }

  const { card, imageUrl, error: scryfallError } = await fetchCardByName(
    commanderName
  );

  if (!card) {
    return NextResponse.json(
      { error: scryfallError ?? "Commander nicht gefunden" },
      { status: 404 }
    );
  }

  const { data: deck, error } = await supabase
    .from("decks")
    .insert({
      user_id: user.id,
      name: name.trim(),
      commander_name: card.name,
      commander_image_url: imageUrl,
      color_identity: card.colors ?? [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Commander direkt als erste Deckkarte anlegen
  const { eur, eurFoil } = getPrices(card);
  await supabase.from("deck_cards").insert({
    deck_id: deck.id,
    user_id: user.id,
    scryfall_id: card.id,
    name: card.name,
    image_url: imageUrl,
    mana_cost: card.mana_cost ?? null,
    cmc: card.cmc,
    type_line: card.type_line,
    colors: card.colors ?? [],
    oracle_text: card.oracle_text ?? null,
    is_commander: true,
    price_eur: eur,
    price_eur_foil: eurFoil,
  });

  return NextResponse.json({ deck });
}
