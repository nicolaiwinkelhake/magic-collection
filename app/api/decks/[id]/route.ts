import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, getPrices } from "@/lib/scryfall";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  // Eigentümerschaft sicherstellen
  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!deck) return NextResponse.json({ error: "Deck nicht gefunden" }, { status: 404 });

  const { name, commanderName } = await request.json();
  const updates: Record<string, unknown> = {};

  if (name?.trim()) updates.name = name.trim();

  // Commander tauschen: neuen Commander bei Scryfall auflösen
  if (commanderName?.trim()) {
    const { card, imageUrl, error } = await fetchCardByName(commanderName);
    if (!card) {
      return NextResponse.json(
        { error: error ?? "Commander nicht gefunden" },
        { status: 404 }
      );
    }
    updates.commander_name = card.name;
    updates.commander_image_url = imageUrl;
    updates.color_identity = card.colors ?? [];

    // Alte Commander-Karte ersetzen
    await supabase
      .from("deck_cards")
      .delete()
      .eq("deck_id", params.id)
      .eq("is_commander", true);

    const { eur, eurFoil } = getPrices(card);
    await supabase.from("deck_cards").insert({
      deck_id: params.id,
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
  }

  if (Object.keys(updates).length) {
    const { error } = await supabase
      .from("decks")
      .update(updates)
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  await supabase.from("decks").delete().eq("id", params.id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
