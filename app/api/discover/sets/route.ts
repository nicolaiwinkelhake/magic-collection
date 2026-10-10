import { requireUser, unauthorized } from "@/lib/apiAuth";
import { cachedSearch } from "@/lib/scryfallCache";
import { fitsIdentity, ownedQuantities } from "@/lib/discover";

export const maxDuration = 60;

const SET_TYPES = new Set(["expansion", "core", "masters", "commander", "draft_innovation"]);

// GET /api/discover/sets           → die letzten erschienenen Sets
// GET /api/discover/sets?code=xyz  → neue Karten des Sets, je Karte die
//                                    eigenen Decks, in die sie farblich passt
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const code = new URL(request.url).searchParams.get("code")?.toLowerCase() ?? "";
  if (!code) {
    const res = await fetch("https://api.scryfall.com/sets", { headers: { "User-Agent": "MagicCollectionApp/1.0" } }).catch(
      () => null
    );
    const data = res?.ok ? await res.json() : { data: [] };
    const today = new Date().toISOString().slice(0, 10);
    const sets = ((data.data ?? []) as Array<{ code: string; name: string; set_type: string; released_at?: string; parent_set_code?: string }>)
      .filter((s) => SET_TYPES.has(s.set_type) && !s.parent_set_code && (s.released_at ?? "") <= today)
      .sort((a, b) => (b.released_at ?? "").localeCompare(a.released_at ?? ""))
      .slice(0, 16)
      .map((s) => ({ code: s.code, name: s.name, releasedAt: s.released_at ?? null }));
    return Response.json({ sets });
  }
  if (!/^[a-z0-9]{2,6}$/.test(code)) return Response.json({ error: "Ungültiger Set-Code" }, { status: 400 });

  const cards = await cachedSearch(supabase, `e:${code} legal:commander -t:basic not:reprint`, { limit: 150, ttlDays: 3 });
  const { data: decks } = await supabase.from("decks").select("id, name, color_identity").eq("user_id", user.id);
  const owned = await ownedQuantities(supabase, user.id, cards.map((c) => c.name));

  return Response.json({
    cards: cards.map((c) => ({
      ...c,
      owned: owned.get(c.name) ?? 0,
      fitsDecks: (decks ?? [])
        .filter((d) => fitsIdentity(c.colorIdentity, (d.color_identity as string[] | null) ?? []))
        .map((d) => ({ id: d.id as string, name: d.name as string })),
    })),
  });
}
