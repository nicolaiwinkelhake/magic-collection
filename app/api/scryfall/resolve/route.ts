import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, getPrices } from "@/lib/scryfall";

// Nimmt einen (per OCR erkannten) Namen und gibt den besten Scryfall-Treffer
// zurück – zur Bestätigung durch den Nutzer, bevor importiert wird.
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const name = new URL(request.url).searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "Kein Name angegeben" }, { status: 400 });

  const { card, imageUrl, error } = await fetchCardByName(name);
  if (!card) {
    return NextResponse.json({ error: error ?? "Nicht gefunden" }, { status: 404 });
  }

  const { eur, eurFoil } = getPrices(card);
  return NextResponse.json({
    id: card.id,
    name: card.name,
    imageUrl,
    eur,
    eurFoil,
    typeLine: card.type_line,
  });
}
