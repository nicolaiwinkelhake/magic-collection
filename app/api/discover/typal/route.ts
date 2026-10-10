import { requireUser, unauthorized } from "@/lib/apiAuth";
import { cachedSearch } from "@/lib/scryfallCache";
import { ownedQuantities, sanitizeType } from "@/lib/discover";

export const maxDuration = 60;

// GET /api/discover/typal?type=Elf – Commander und beliebte Karten eines
// Kreaturentyps (inkl. Karten, die den Typ erwähnen), mit Besitz.
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const type = sanitizeType(new URL(request.url).searchParams.get("type") ?? "");
  if (!type) return Response.json({ error: "Bitte einen Kreaturentyp angeben, z. B. Elf, Zombie, Dragon." }, { status: 400 });
  const t = type.includes(" ") ? `"${type}"` : type;

  const [commanders, cards] = await Promise.all([
    cachedSearch(supabase, `is:commander legal:commander t:${t}`, { limit: 24, ttlDays: 14 }),
    cachedSearch(supabase, `legal:commander -is:commander (t:${t} or o:${t})`, { limit: 48, ttlDays: 14 }),
  ]);
  const owned = await ownedQuantities(supabase, user.id, [...commanders, ...cards].map((c) => c.name));
  const mark = <T extends { name: string }>(list: T[]) => list.map((c) => ({ ...c, owned: owned.get(c.name) ?? 0 }));
  return Response.json({ type, commanders: mark(commanders), cards: mark(cards) });
}
