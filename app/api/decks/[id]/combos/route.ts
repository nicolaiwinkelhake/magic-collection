import { requireUser, unauthorized } from "@/lib/apiAuth";
import { findCombos } from "@/lib/commanderSpellbook";
import { selectAll } from "@/lib/supabase/selectAll";

export const maxDuration = 60;

// Combos im Deck und solche, denen nur eine Karte fehlt (Commander Spellbook),
// plus Karten der Gruppe, die in vergleichbaren Decks häufig sind.
// Antwort: { included, almost: [{ ..., missing, missingOwned }], staples, comparable }
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!deck) return Response.json({ error: "Deck nicht gefunden" }, { status: 404 });

  const { data: rows } = await supabase.from("deck_cards").select("name, is_commander").eq("deck_id", params.id);
  const main = (rows ?? []).filter((r) => !r.is_commander).map((r) => r.name as string);
  const commanders = (rows ?? []).filter((r) => r.is_commander).map((r) => r.name as string);

  const combos = await findCombos(main, commanders);
  const almost = (combos?.almostIncluded ?? []).filter((c) => c.missing.length === 1).slice(0, 15);

  // Gruppenvergleich (eigene + Freundes-Decks mit gleichem Commander/Farben).
  const { data: staples } = await supabase.rpc("group_deck_staples", { p_deck_id: params.id });

  // Besitz der fehlenden Karten markieren.
  const wanted = Array.from(
    new Set([
      ...almost.flatMap((c) => c.missing),
      ...((staples ?? []) as Array<{ name: string }>).map((s) => s.name),
    ])
  );
  const owned = wanted.length
    ? await selectAll<{ name: string; quantity: number }>(() =>
        supabase.from("cards").select("name, quantity").eq("user_id", user.id).in("name", wanted).order("id")
      )
    : [];
  const ownedQty = new Map<string, number>();
  for (const o of owned) ownedQty.set(o.name, (ownedQty.get(o.name) ?? 0) + o.quantity);

  const stapleRows = (staples ?? []) as Array<{ name: string; decks: number; comparable: number }>;
  return Response.json({
    available: combos !== null,
    included: (combos?.included ?? []).slice(0, 20),
    almost: almost.map((c) => ({ ...c, missingOwned: ownedQty.get(c.missing[0]) ?? 0 })),
    comparable: stapleRows[0]?.comparable ?? 0,
    staples: stapleRows.slice(0, 20).map((s) => ({ name: s.name, decks: s.decks, owned: ownedQty.get(s.name) ?? 0 })),
  });
}
