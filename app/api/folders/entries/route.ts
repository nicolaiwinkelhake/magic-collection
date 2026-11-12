import { requireUser, unauthorized } from "@/lib/apiAuth";

// Karten einem Ordner zuordnen oder daraus entfernen (Migration 015).
// Eine Karte kann in beliebig vielen Ordnern stehen – Sammlung und
// Wunschliste gemischt. Body: { folderId, action: "add" | "remove",
// cardIds?: string[], wishlistIds?: string[] }. Antwort: { changed }.
const ids = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [];

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const folderId = typeof body.folderId === "string" ? body.folderId : "";
  const action = body.action === "remove" ? "remove" : body.action === "add" ? "add" : null;
  const cardIds = ids(body.cardIds);
  const wishlistIds = ids(body.wishlistIds);
  if (!folderId || !action) return Response.json({ error: "Ordner oder Aktion fehlt" }, { status: 400 });
  if (!cardIds.length && !wishlistIds.length) return Response.json({ error: "Keine Karten angegeben" }, { status: 400 });

  const { data, error } = await supabase.rpc(action === "add" ? "folder_add" : "folder_remove", {
    p_folder_id: folderId,
    p_card_ids: cardIds,
    p_wishlist_ids: wishlistIds,
  });
  if (error) {
    const status = /Ordner nicht gefunden/.test(error.message) ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ ok: true, changed: data ?? 0 });
}
