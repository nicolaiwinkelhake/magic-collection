import { requireUser, unauthorized } from "@/lib/apiAuth";

// "Karte behalten" setzen/aufheben: Der Deck-Check schlägt die Karte dann
// nicht mehr zum Rausnehmen vor. Body: { cardId, keep }
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const cardId = typeof body.cardId === "string" && /^[\w-]{1,64}$/.test(body.cardId) ? body.cardId : null;
  if (!cardId) return Response.json({ error: "cardId fehlt" }, { status: 400 });
  const { data, error } = await supabase
    .from("deck_cards")
    .update({ keep: body.keep !== false })
    .eq("id", cardId)
    .eq("deck_id", params.id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return Response.json({ error: "Konnte nicht gespeichert werden" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "Karte nicht gefunden" }, { status: 404 });
  return Response.json({ ok: true });
}
