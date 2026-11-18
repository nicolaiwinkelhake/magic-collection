import { requireUser, unauthorized } from "@/lib/apiAuth";
import { loadSellState } from "@/lib/sellServer";

export const dynamic = "force-dynamic";

// Stand "Extern verkaufen": Verkaufsordner (werden bei Bedarf angelegt),
// Kleinanzeigen-Anzeigen (Unterordner) und die Karten darin.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  try {
    return Response.json(await loadSellState(supabase, user.id));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
