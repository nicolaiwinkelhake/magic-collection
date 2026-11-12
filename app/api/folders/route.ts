import { requireUser, unauthorized } from "@/lib/apiAuth";

// Eigene Ordner (Sammlung + Wunschliste): anlegen, umbenennen, löschen.
// Löschen entfernt nur den Ordner und seine Zuordnungen – die Karten
// bleiben in Sammlung bzw. Wunschliste (delete_folder, Migration 015).

function cleanName(raw: unknown): string | null {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const { data, error } = await supabase.from("folders").select("id, name, created_at").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ folders: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const name = cleanName(body.name);
  if (!name) return Response.json({ error: "Name fehlt oder ist zu lang (max. 60 Zeichen)" }, { status: 400 });
  const { data, error } = await supabase
    .from("folders")
    .insert({ user_id: user.id, name })
    .select("id, name, created_at")
    .single();
  if (error) {
    const dup = error.code === "23505";
    return Response.json({ error: dup ? `Einen Ordner „${name}“ gibt es schon` : error.message }, { status: dup ? 409 : 500 });
  }
  return Response.json({ folder: data });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const name = cleanName(body.name);
  if (!body.id || !name) return Response.json({ error: "Ordner oder Name fehlt" }, { status: 400 });
  const { data, error } = await supabase
    .from("folders")
    .update({ name })
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select("id, name, created_at")
    .maybeSingle();
  if (error) {
    const dup = error.code === "23505";
    return Response.json({ error: dup ? `Einen Ordner „${name}“ gibt es schon` : error.message }, { status: dup ? 409 : 500 });
  }
  if (!data) return Response.json({ error: "Ordner nicht gefunden" }, { status: 404 });
  return Response.json({ folder: data });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "Ordner fehlt" }, { status: 400 });
  const { data, error } = await supabase.rpc("delete_folder", { p_folder_id: body.id });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, removedEntries: data });
}
