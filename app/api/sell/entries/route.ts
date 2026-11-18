import { requireUser, unauthorized } from "@/lib/apiAuth";

// Verkaufspreis / Menge einer Karte im Verkauf ändern, oder sie aus dem
// Verkauf nehmen (bleibt in der Sammlung).
export async function PATCH(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "Eintrag fehlt" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.asking_price !== undefined) {
    if (body.asking_price === null || body.asking_price === "") updates.asking_price = null;
    else {
      const n = Number(body.asking_price);
      if (!Number.isFinite(n) || n < 0 || n >= 1e7) return Response.json({ error: "Ungültiger Preis" }, { status: 400 });
      updates.asking_price = Math.round(n * 100) / 100;
    }
  }
  if (body.sell_quantity !== undefined) {
    if (body.sell_quantity === null) updates.sell_quantity = null;
    else {
      const q = Math.floor(Number(body.sell_quantity));
      if (!(q > 0)) return Response.json({ error: "Ungültige Menge" }, { status: 400 });
      updates.sell_quantity = q;
    }
  }
  if (body.folder_id !== undefined) {
    // in andere Anzeige verschieben – nur in eigene Ordner
    const { data: f } = await supabase.from("folders").select("id").eq("id", body.folder_id).eq("user_id", user.id).maybeSingle();
    if (!f) return Response.json({ error: "Ziel nicht gefunden" }, { status: 404 });
    updates.folder_id = body.folder_id;
  }
  const { data, error } = await supabase
    .from("folder_entries")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select("id, folder_id, asking_price, sell_quantity")
    .maybeSingle();
  if (error) return Response.json({ error: error.code === "23505" ? "Die Karte ist dort schon drin" : error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
  return Response.json({ entry: data });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (!ids.length) return Response.json({ error: "Eintrag fehlt" }, { status: 400 });
  const { error } = await supabase.from("folder_entries").delete().in("id", ids).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
