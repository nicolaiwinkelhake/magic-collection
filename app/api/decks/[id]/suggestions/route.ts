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

  const rawResult: Array<{
    category: SuggestionCategory;
    label: string;
    cards: Awaited<ReturnType<typeof fetchSuggestions>>;
  }> = [];

  for (const category of weak) {
    const url = buildSuggestionUrl(category, deck.color_identity ?? []);
    const suggestions = await fetchSuggestions(url, excludeNames, 6);
    rawResult.push({ category, label: CATEGORY_LABEL[category], cards: suggestions });
    await sleep(120); // Scryfall-freundliches Tempo
  }

  // Für alle vorgeschlagenen Karten: eigene Sammlung, andere eigene Decks
  // und Freundes-Sammlungen abfragen, damit man sofort sieht, ob man die
  // Karte schon hat oder sie sich von einem Freund leihen könnte.
  const allSuggested = rawResult.flatMap((g) => g.cards);
  const names = Array.from(new Set(allSuggested.map((c) => c.name)));
  const namesLower = names.map((n) => n.toLowerCase());

  // Abgleich über den Kartennamen (nicht die Scryfall-Druck-ID!) – Scryfalls
  // Vorschlags-Suche liefert oft eine andere Printing derselben Karte als
  // die, die man besitzt/im Deck hat, daher würde ein ID-Abgleich meistens
  // ins Leere laufen.
  const ownedByName = new Map<string, number>();
  const otherDecksByName = new Map<string, Map<string, string>>();

  if (namesLower.length) {
    const { data: ownedRows } = await supabase
      .from("cards")
      .select("name, quantity")
      .eq("user_id", user.id)
      .in("name", names);
    for (const r of ownedRows ?? []) {
      const key = r.name.toLowerCase();
      ownedByName.set(key, (ownedByName.get(key) ?? 0) + r.quantity);
    }

    const { data: otherDeckRows } = await supabase
      .from("deck_cards")
      .select("name, deck_id")
      .eq("user_id", user.id)
      .neq("deck_id", params.id)
      .in("name", names);

    const otherDeckIds = Array.from(new Set((otherDeckRows ?? []).map((r) => r.deck_id)));
    const deckNameById = new Map<string, string>();
    if (otherDeckIds.length) {
      const { data: deckRows } = await supabase
        .from("decks")
        .select("id, name")
        .in("id", otherDeckIds);
      for (const d of deckRows ?? []) deckNameById.set(d.id, d.name);
    }

    for (const row of otherDeckRows ?? []) {
      const deckName = deckNameById.get(row.deck_id);
      if (!deckName) continue;
      const key = row.name.toLowerCase();
      const map = otherDecksByName.get(key) ?? new Map<string, string>();
      map.set(row.deck_id, deckName);
      otherDecksByName.set(key, map);
    }
  }

  const friendsByName = new Map<string, { friendEmail: string; quantity: number }[]>();
  for (const name of names) {
    const { data, error } = await supabase.rpc("friends_owning_card", { card_name: name });
    if (!error && data?.length) {
      friendsByName.set(
        name,
        data.map((row: { friend_email: string; quantity: number }) => ({
          friendEmail: row.friend_email,
          quantity: row.quantity,
        }))
      );
    }
  }

  const result = rawResult.map((group) => ({
    ...group,
    cards: group.cards.map((c) => {
      const key = c.name.toLowerCase();
      return {
        ...c,
        ownedQuantity: ownedByName.get(key) ?? 0,
        usedInDecks: Array.from(otherDecksByName.get(key)?.values() ?? []),
        friendsOwning: friendsByName.get(c.name) ?? [],
      };
    }),
  }));

  return NextResponse.json({ suggestions: result });
}
