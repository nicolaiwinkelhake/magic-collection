import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Legendäre Kreaturen/Planeswalker aus der eigenen Sammlung, die als Commander
// infrage kommen - Basis für die Vorschlagsliste im AI Deck Generator.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { data: cards } = await supabase
    .from("cards")
    .select("name, image_url, colors, type_line")
    .eq("user_id", user.id)
    .ilike("type_line", "%Legendary%");

  const { data: existingDecks } = await supabase
    .from("decks")
    .select("commander_name")
    .eq("user_id", user.id);
  const existingCommanders = new Set(
    (existingDecks ?? []).map((d) => d.commander_name.toLowerCase())
  );

  const commanders = (cards ?? [])
    .filter((c) => /Creature|Planeswalker/.test(c.type_line ?? ""))
    .map((c) => ({
      name: c.name,
      imageUrl: c.image_url,
      colors: c.colors ?? [],
      hasDeck: existingCommanders.has(c.name.toLowerCase()),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ commanders });
}
