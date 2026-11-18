import { requireUser, unauthorized } from "@/lib/apiAuth";
import { ensureRoots } from "@/lib/sellServer";

// Kleinanzeigen-Anzeigen = Unterordner von "Verkauf · Kleinanzeigen".
const clean = (raw: unknown) => {
  const n = String(raw ?? "").replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= 60 ? n : null;
};
const price = (raw: unknown) => {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : undefined;
};

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const name = clean(body.name);
  if (!name) return Response.json({ error: "Name fehlt oder ist zu lang (max. 60 Zeichen)" }, { status: 400 });
  const roots = await ensureRoots(supabase, user.id);
  const { data, error } = await supabase
    .from("folders")
    .insert({ user_id: user.id, name, parent_id: roots.kleinanzeigen.id })
    .select("id, name, parent_id, channel, asking_price, created_at")
    .single();
  if (error) {
    const dup = error.code === "23505";
    return Response.json({ error: dup ? `Eine Anzeige „${name}“ gibt es schon` : error.message }, { status: dup ? 409 : 500 });
  }
  return Response.json({ ad: data });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "Anzeige fehlt" }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const n = clean(body.name);
    if (!n) return Response.json({ error: "Name fehlt oder ist zu lang" }, { status: 400 });
    updates.name = n;
  }
  if (body.asking_price !== undefined) {
    const p = price(body.asking_price);
    if (p === undefined) return Response.json({ error: "Ungültiger Preis" }, { status: 400 });
    updates.asking_price = p;
  }
  const { data, error } = await supabase
    .from("folders")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .not("parent_id", "is", null)
    .select("id, name, parent_id, channel, asking_price, created_at")
    .maybeSingle();
  if (error) return Response.json({ error: error.code === "23505" ? "Name schon vergeben" : error.message }, { status: error.code === "23505" ? 409 : 500 });
  if (!data) return Response.json({ error: "Anzeige nicht gefunden" }, { status: 404 });
  return Response.json({ ad: data });
}

// Anzeige auflösen: Karten bleiben in der Sammlung.
export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "Anzeige fehlt" }, { status: 400 });
  const { error } = await supabase.from("folders").delete().eq("id", body.id).eq("user_id", user.id).not("parent_id", "is", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
