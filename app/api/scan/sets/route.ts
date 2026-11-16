import { requireUser, unauthorized } from "@/lib/apiAuth";
import { selectAll } from "@/lib/supabase/selectAll";

// Aus welchen Sets stammen die eigenen Karten (und die mit mir geteilten
// Sammlungen)? Der Scanner nutzt das als Vorwissen: Ein verlesenes
// Set-Kürzel wird auf das wahrscheinlichste bekannte Set korrigiert.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  // ohne Filter auf user_id: die Zugriffsregeln liefern eigene + geteilte Sammlungen
  const rows = await selectAll<{ set_code: string | null }>(() => supabase.from("cards").select("set_code").not("set_code", "is", null).order("id")).catch(() => []);
  const sets: Record<string, number> = {};
  for (const r of rows) {
    const code = r.set_code!.toLowerCase();
    sets[code] = (sets[code] ?? 0) + 1;
  }
  return Response.json({ sets }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
