import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, getPrices, sleep } from "@/lib/scryfall";
import { parseDeckList } from "@/lib/parseDeckList";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { names } = await request.json();
  const entries = parseDeckList((names ?? "").toString());
  if (!entries.length) {
    return NextResponse.json({ error: "Keine Karten angegeben" }, { status: 400 });
  }

  const notFound: string[] = [];
  let added = 0;
  const unique = Array.from(new Set(entries.map((e) => e.name)));

  for (const name of unique) {
    const r = await fetchCardByName(name);
    await sleep(100);
    if (!r.card) {
      notFound.push(name);
      continue;
    }
    const { eur } = getPrices(r.card);
    const { error } = await supabase.from("wishlist").upsert(
      {
        user_id: user.id,
        scryfall_id: r.card.id,
        name: r.card.name,
        image_url: r.imageUrl,
        price_eur: eur,
      },
      { onConflict: "user_id,scryfall_id" }
    );
    if (!error) added += 1;
  }

  return NextResponse.json({ added, notFound });
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { id } = await request.json();
  await supabase.from("wishlist").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
