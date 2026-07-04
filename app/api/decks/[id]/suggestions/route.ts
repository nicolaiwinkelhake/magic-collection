import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSuggestions, sleep } from "@/lib/scryfall";
import { weakCategories } from "@/lib/deckAnalysis";
import {
  buildSuggestionUrl,
  CATEGORY_LABEL,
  type SuggestionCategory,
} from "@/lib/scryfallSearch";

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
    .select("id, color_identity")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!deck) return NextResponse.json({ error: "Deck nicht gefunden" }, { status: 404 });

  const { data: deckCards } = await supabase
    .from("deck_cards")
    .select("name, type_line, oracle_text, cmc, colors, is_commander")
    .eq("deck_id", params.id);

  const cards = deckCards ?? [];
  const excludeNames = cards.map((c) => c.name);

  // Schwache Kategorien bestimmen (max. 3, um Scryfall-Anfragen zu begrenzen)
  const weak = weakCategories(
    cards.map((c) => ({
      name: c.name,
      type_line: c.type_line,
      oracle_text: c.oracle_text,
      cmc: c.cmc,
      colors: c.colors,
      is_commander: c.is_commander,
    }))
  ).slice(0, 3);

  const result: Array<{
    category: SuggestionCategory;
    label: string;
    cards: Awaited<ReturnType<typeof fetchSuggestions>>;
  }> = [];

  for (const category of weak) {
    const url = buildSuggestionUrl(category, deck.color_identity ?? []);
    const suggestions = await fetchSuggestions(url, excludeNames, 6);
    result.push({ category, label: CATEGORY_LABEL[category], cards: suggestions });
    await sleep(120); // Scryfall-freundliches Tempo
  }

  return NextResponse.json({ suggestions: result });
}
