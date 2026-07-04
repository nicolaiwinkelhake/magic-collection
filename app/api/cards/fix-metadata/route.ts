import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SCRYFALL_BASE = "https://api.scryfall.com";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  // Karten ohne set_code oder rarity laden
  const { data: cards } = await supabase
    .from("cards")
    .select("id, scryfall_id")
    .eq("user_id", user.id)
    .or("set_code.is.null,rarity.is.null");

  if (!cards?.length) return NextResponse.json({ updated: 0 });

  let updated = 0;
  const CHUNK = 75;

  for (let i = 0; i < cards.length; i += CHUNK) {
    const chunk = cards.slice(i, i + CHUNK);
    const body = { identifiers: chunk.map((c) => ({ id: c.scryfall_id })) };

    const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "MagicCollectionApp/1.0" },
      body: JSON.stringify(body),
    });
    if (!res.ok) continue;

    const data = await res.json();
    const found: Array<{ id: string; set: string; collector_number: string; rarity: string }> = data.data ?? [];

    for (const card of found) {
      const dbCard = chunk.find((c) => c.scryfall_id === card.id);
      if (!dbCard) continue;
      await supabase
        .from("cards")
        .update({ set_code: card.set, collector_number: card.collector_number, rarity: card.rarity })
        .eq("id", dbCard.id)
        .eq("user_id", user.id);
      updated++;
    }

    if (i + CHUNK < cards.length) await new Promise((r) => setTimeout(r, 100));
  }

  return NextResponse.json({ updated });
}
