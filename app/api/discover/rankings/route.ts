import { requireUser, unauthorized } from "@/lib/apiAuth";
import { cachedSearch, identityFilter } from "@/lib/scryfallCache";
import { ownedQuantities } from "@/lib/discover";
import { sortIdentity } from "@/lib/colorIdentity";

export const maxDuration = 60;

// GET /api/discover/rankings?colors=BG
// Top-Commander (Scryfall-Beliebtheit, optional nur innerhalb der Farben),
// alle Game Changer und die Ranglisten des Freundeskreises – mit Besitz.
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const colors = sortIdentity((new URL(request.url).searchParams.get("colors") ?? "").split(""));
  const colorQuery = colors.length ? ` ${identityFilter(colors)}` : "";

  const [commanders, gameChangers, group] = await Promise.all([
    cachedSearch(supabase, `is:commander legal:commander${colorQuery}`, { limit: 40, ttlDays: 7 }),
    cachedSearch(supabase, "is:gamechanger", { limit: 120, ttlDays: 7 }),
    supabase.rpc("group_rankings"),
  ]);
  const groupRows = (group.data ?? []) as Array<{ kind: string; name: string; decks: number }>;

  const owned = await ownedQuantities(supabase, user.id, [
    ...commanders.map((c) => c.name),
    ...gameChangers.map((c) => c.name),
    ...groupRows.map((r) => r.name),
  ]);
  const mark = <T extends { name: string }>(list: T[]) => list.map((c) => ({ ...c, owned: owned.get(c.name) ?? 0 }));

  return Response.json({
    colors,
    commanders: mark(commanders),
    gameChangers: mark(gameChangers),
    groupCommanders: mark(groupRows.filter((r) => r.kind === "commander")),
    groupCards: mark(groupRows.filter((r) => r.kind === "card")),
  });
}
