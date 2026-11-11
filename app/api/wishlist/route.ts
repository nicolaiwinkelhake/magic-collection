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
      // DO NOTHING bei Konflikt: es gibt keine Update-Policy, ein normales
      // Upsert scheiterte daher an bereits vorhandenen Karten.
      { onConflict: "user_id,scryfall_id", ignoreDuplicates: true }
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

  // Ein Eintrag ({ id }) oder mehrere ({ ids: [...] }) – für Mehrfachauswahl
  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (!ids.length) return NextResponse.json({ error: "Keine Einträge angegeben" }, { status: 400 });
  const { error } = await supabase.from("wishlist").delete().in("id", ids).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}
