import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardRoles, NAMES_PER_QUERY, type CardRole } from "@/lib/cardRoles";

export const maxDuration = 60;

const READ_CHUNK = 150;
// Je Aufruf höchstens so viele Namen neu bei Scryfall nachschlagen (8 Rollen-
// Suchen je 20 Namen ≈ 8 s); der Client ruft erneut auf, bis pending = 0.
const FETCH_PER_CALL = NAMES_PER_QUERY * 3;

// Erwartet { names: string[] }. Antwort: { roles: { [name]: CardRole[] }, pending }
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const names: string[] = Array.from(
    new Set<string>((Array.isArray(body?.names) ? body.names : []).filter((n: unknown) => typeof n === "string" && n))
  ).slice(0, 500);
  if (!names.length) return Response.json({ roles: {}, pending: 0 });

  const roles: Record<string, CardRole[]> = {};
  for (let i = 0; i < names.length; i += READ_CHUNK) {
    const { data, error } = await supabase
      .from("card_roles")
      .select("name, roles")
      .in("name", names.slice(i, i + READ_CHUNK));
    if (error) return Response.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) roles[r.name as string] = r.roles as CardRole[];
  }

  const missing = names.filter((n) => !(n in roles));
  const fetched = await fetchCardRoles(missing.slice(0, FETCH_PER_CALL));
  if (fetched.size) {
    const payload = Array.from(fetched, ([name, r]) => ({ name, roles: r }));
    const { error } = await supabase.rpc("save_card_roles", { p_roles: payload });
    if (error) console.error("Kartenrollen nicht gespeichert", error);
    for (const { name, roles: r } of payload) roles[name] = r;
  }

  return Response.json({ roles, pending: names.filter((n) => !(n in roles)).length });
}
