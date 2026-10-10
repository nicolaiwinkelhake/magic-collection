import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchGameChangerNames } from "@/lib/scryfall";
import { analyzeBracket } from "@/lib/bracket";
import { estimateBracketFlags, findCombos } from "@/lib/commanderSpellbook";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!deck) return NextResponse.json({ error: "Deck nicht gefunden" }, { status: 404 });

  const { data: deckCards } = await supabase
    .from("deck_cards")
    .select("name, type_line, oracle_text, is_commander")
    .eq("deck_id", params.id);

  const cards = deckCards ?? [];
  const main = cards.filter((c) => !c.is_commander).map((c) => c.name as string);
  const commanders = cards.filter((c) => c.is_commander).map((c) => c.name as string);

  // Scryfall-Game-Changer + Commander Spellbook (offizielle Listen, echte
  // Combos). Fällt Spellbook aus, bleibt die eigene Heuristik.
  const [gameChangerNames, flags, combos] = await Promise.all([
    fetchGameChangerNames(),
    estimateBracketFlags(main, commanders),
    findCombos(main, commanders),
  ]);

  const result = analyzeBracket(
    cards.map((c) => ({
      name: c.name,
      type_line: c.type_line,
      oracle_text: c.oracle_text,
      is_commander: c.is_commander,
    })),
    gameChangerNames,
    {
      gameChangers: flags?.gameChangers,
      massLandDenial: flags?.massLandDenial,
      extraTurns: flags?.extraTurns,
      twoCardCombos: (combos?.included ?? []).filter((c) => c.cards.length === 2).map((c) => c.cards),
    }
  );

  return NextResponse.json({ ...result, spellbook: flags !== null });
}
