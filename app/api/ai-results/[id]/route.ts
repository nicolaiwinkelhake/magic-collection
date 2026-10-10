import { requireUser, unauthorized } from "@/lib/apiAuth";

// PATCH { applied: string[] } – merkt sich, welche Coach-Tausche übernommen
// wurden (im gespeicherten Ergebnis).
// DELETE – gespeichertes Ergebnis löschen.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const applied: string[] = Array.isArray(body?.applied) ? body.applied.filter((x: unknown) => typeof x === "string") : [];

  const { data: row } = await supabase
    .from("ai_results")
    .select("result")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!row) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

  const result = { ...(row.result as Record<string, unknown>), applied };
  const { error } = await supabase.from("ai_results").update({ result }).eq("id", params.id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const { error } = await supabase.from("ai_results").delete().eq("id", params.id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
