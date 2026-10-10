import { requireUser, unauthorized } from "@/lib/apiAuth";

// Gespeicherte Vorschläge des AI Deck Generators (neueste zuerst).
// ?id=... liefert einen einzelnen Vorschlag inkl. vollständigem Ergebnis.
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const { data } = await supabase
      .from("ai_results")
      .select("id, created_at, params, result")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("kind", "deck_generator")
      .single();
    if (!data) return Response.json({ error: "Nicht gefunden" }, { status: 404 });
    return Response.json({ id: data.id, createdAt: data.created_at, params: data.params, result: data.result });
  }

  const { data, error } = await supabase
    .from("ai_results")
    .select("id, created_at, title, params")
    .eq("user_id", user.id)
    .eq("kind", "deck_generator")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    history: (data ?? []).map((r) => ({ id: r.id, createdAt: r.created_at, title: r.title, params: r.params })),
  });
}
