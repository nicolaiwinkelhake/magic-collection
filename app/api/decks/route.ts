import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/apiAuth";
import { unionIdentity } from "@/lib/colorIdentity";
import {
  addCommanderToCollection,
  commanderDeckRow,
  identityOf,
  resolveCommander,
  type ResolvedCommander,
} from "@/lib/deckCommanders";

// Erwartet { name, commanderName, partnerName? }. partnerName = zweiter
// Commander (Partner, Background, "Friends forever" …).
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const { name, commanderName, partnerName } = body as {
    name: string;
    commanderName: string;
    partnerName?: string;
  };

  if (!name?.trim() || !commanderName?.trim()) {
    return NextResponse.json({ error: "Deckname und Commander-Name sind erforderlich" }, { status: 400 });
  }

  const commanders: ResolvedCommander[] = [];
  for (const n of [commanderName, partnerName].filter((x): x is string => Boolean(x?.trim()))) {
    const resolved = await resolveCommander(n.trim());
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 404 });
    commanders.push(resolved);
  }
  const [main, partner] = commanders;

  const { data: deck, error } = await supabase
    .from("decks")
    .insert({
      user_id: user.id,
      name: name.trim(),
      commander_name: main.card.name,
      partner_name: partner?.card.name ?? null,
      commander_image_url: main.imageUrl,
      // Farbidentität (nicht "colors"): Vereinigung aller Commander.
      color_identity: unionIdentity(commanders.map((c) => identityOf(c.card))),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Commander direkt als Deckkarten anlegen und in die Sammlung eintragen.
  await supabase.from("deck_cards").insert(commanders.map((c) => commanderDeckRow(deck.id, user.id, c)));
  for (const c of commanders) await addCommanderToCollection(supabase, user.id, c);

  return NextResponse.json({ deck });
}
