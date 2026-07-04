import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchGameChangerNames } from "@/lib/scryfall";
import { analyzeBracket } from "@/lib/bracket";

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

  const gameChangerNames = await fetchGameChangerNames();

  const result = analyzeBracket(
    (deckCards ?? []).map((c) => ({
      name: c.name,
      type_line: c.type_line,
      oracle_text: c.oracle_text,
      is_commander: c.is_commander,
    })),
    gameChangerNames
  );

  return NextResponse.json(result);
}
