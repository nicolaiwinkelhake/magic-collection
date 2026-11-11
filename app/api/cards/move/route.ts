import { requireUser, unauthorized } from "@/lib/apiAuth";

// Sammlungseinträge in einen Ordner verschieben (folderId null = Unsortiert).
// Gleiche Karten (Druck + Foil) im Zielordner werden zusammengelegt – atomar
// in der Datenbank (move_cards, Migration 014).
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const folderId: string | null = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
  if (!ids.length) return Response.json({ error: "Keine Karten angegeben" }, { status: 400 });
  const { data, error } = await supabase.rpc("move_cards", { p_ids: ids, p_folder_id: folderId });
  if (error) {
    const status = /Ordner nicht gefunden/.test(error.message) ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ ok: true, moved: data });
}
