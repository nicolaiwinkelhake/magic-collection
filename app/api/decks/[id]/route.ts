import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unionIdentity } from "@/lib/colorIdentity";
import { commanderDeckRow, resolveCommander } from "@/lib/deckCommanders";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  // Eigentümerschaft sicherstellen
  const { data: deck } = await supabase
    .from("decks")
    .select("id, commander_name, partner_name")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!deck) return NextResponse.json({ error: "Deck nicht gefunden" }, { status: 404 });

  // partnerName: undefined = unverändert, "" = Partner entfernen
  const { name, commanderName, partnerName } = (await request.json()) as {
    name?: string;
    commanderName?: string;
    partnerName?: string;
  };
  const updates: Record<string, unknown> = {};
  let commandersChanged = false;

  if (name?.trim()) updates.name = name.trim();

  // Eine Commander-Zeile (Haupt-Commander oder Partner) gezielt ersetzen.
  // Früher wurden ALLE Commander-Zeilen gelöscht – ein Partner ging verloren.
  async function replaceCommander(oldName: string | null, newName: string | null) {
    let resolved = null;
    if (newName) {
      const r = await resolveCommander(newName);
      if ("error" in r) return { error: r.error };
      resolved = r;
    }
    if (oldName) {
      await supabase
        .from("deck_cards")
        .delete()
        .eq("deck_id", params.id)
        .eq("is_commander", true)
        .eq("name", oldName);
    }
    if (resolved) await supabase.from("deck_cards").insert(commanderDeckRow(params.id, user!.id, resolved));
    commandersChanged = true;
    return { resolved };
  }

  if (commanderName?.trim()) {
    const r = await replaceCommander(deck.commander_name, commanderName.trim());
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
    updates.commander_name = r.resolved!.card.name;
    updates.commander_image_url = r.resolved!.imageUrl;
  }

  if (partnerName !== undefined) {
    const r = await replaceCommander(deck.partner_name, partnerName.trim() || null);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
    updates.partner_name = r.resolved?.card.name ?? null;
  }

  // Farbidentität = Vereinigung aller (verbleibenden) Commander.
  if (commandersChanged) {
    const { data: rows } = await supabase
      .from("deck_cards")
      .select("color_identity")
      .eq("deck_id", params.id)
      .eq("is_commander", true);
    updates.color_identity = unionIdentity((rows ?? []).map((r) => (r.color_identity as string[] | null) ?? []));
  }

  if (Object.keys(updates).length) {
    const { error } = await supabase
      .from("decks")
      .update(updates)
      .eq("id", params.id)
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  await supabase.from("decks").delete().eq("id", params.id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
