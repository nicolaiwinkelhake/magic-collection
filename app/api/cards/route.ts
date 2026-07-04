import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/apiAuth";

// Menge/Foil/Zustand/Sprache einer Sammlungskarte ändern.
export async function PATCH(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { id, quantity, foil, condition, language } = await request.json();

  const updates: Record<string, unknown> = {};
  if (quantity !== undefined) {
    const q = Math.max(0, parseInt(quantity, 10) || 0);
    if (q === 0) {
      // Menge 0 -> Karte entfernen
      await supabase.from("cards").delete().eq("id", id).eq("user_id", user.id);
      await supabase.rpc("snapshot_collection_value");
      return NextResponse.json({ deleted: true });
    }
    updates.quantity = q;
  }
  if (foil !== undefined) updates.foil = !!foil;
  if (condition !== undefined) updates.condition = condition;
  if (language !== undefined) updates.language = language;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
  }

  const { error } = await supabase
    .from("cards")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.rpc("snapshot_collection_value");
  return NextResponse.json({ ok: true });
}

// Eine Karte ({ id }) oder mehrere ({ ids: [...] }) löschen – für Bulk-Aktionen.
export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids
    : body.id
      ? [body.id]
      : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Keine IDs angegeben" }, { status: 400 });
  }

  const { error } = await supabase
    .from("cards")
    .delete()
    .in("id", ids)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.rpc("snapshot_collection_value");
  return NextResponse.json({ deleted: ids.length });
}
