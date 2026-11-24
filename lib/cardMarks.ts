import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardMarks } from "@/lib/commanderLists";
import { selectAll } from "@/lib/supabase/selectAll";

const IN_CHUNK = 150;

/** Je Kartenname: Besitz, eigene Decks, Freunde mit der Karte, Gruppen-Decks. */
export async function loadCardMarks(supabase: SupabaseClient, userId: string, names: string[]): Promise<Map<string, CardMarks>> {
  const marks = new Map<string, CardMarks>(names.map((n) => [n, { owned: 0, inDecks: [], friends: [], groupDecks: 0 }]));

  for (let i = 0; i < names.length; i += IN_CHUNK) {
    const chunk = names.slice(i, i + IN_CHUNK);
    const owned = await selectAll<{ name: string; quantity: number }>(() =>
      supabase.from("cards").select("name, quantity").eq("user_id", userId).in("name", chunk).order("id")
    );
    for (const o of owned) marks.get(o.name)!.owned += o.quantity;

    // Join liefert je nach Schema-Erkennung ein Objekt oder ein Array.
    const inDecks = await selectAll<{ name: string; decks: { name: string } | { name: string }[] | null }>(() =>
      supabase.from("deck_cards").select("name, decks(name)").eq("user_id", userId).in("name", chunk).order("id")
    );
    for (const d of inDecks) {
      const m = marks.get(d.name)!;
      const deckNames = Array.isArray(d.decks) ? d.decks.map((x) => x.name) : d.decks ? [d.decks.name] : [];
      for (const dn of deckNames) if (!m.inDecks.includes(dn)) m.inDecks.push(dn);
    }

    const { data: friends } = await supabase.rpc("friends_owning_cards", { p_names: chunk });
    for (const f of (friends ?? []) as Array<{ name: string; friend_email: string; quantity: number }>) {
      marks.get(f.name)?.friends.push({ friendEmail: f.friend_email, quantity: f.quantity });
    }

    const { data: group } = await supabase.rpc("group_card_counts", { p_names: chunk });
    for (const g of (group ?? []) as Array<{ name: string; decks: number }>) {
      const m = marks.get(g.name);
      if (m) m.groupDecks = g.decks;
    }
  }

  // Offene Trades, die ich angefragt habe: Karten, die ich bekommen soll
  const { data: trades } = await supabase.rpc("my_trades");
  for (const t of (trades ?? []) as Array<{ status: string; i_am_proposer: boolean; partner_email: string; items: Array<{ name: string; from_user_id: string }> }>) {
    if (t.status !== "pending" || !t.i_am_proposer) continue;
    const who = (t.partner_email ?? "").split("@")[0] || "Freund";
    for (const it of t.items ?? []) {
      if (it.from_user_id === userId) continue;
      const m = marks.get(it.name);
      if (!m) continue;
      m.requestedFrom ??= [];
      if (!m.requestedFrom.includes(who)) m.requestedFrom.push(who);
    }
  }
  return marks;
}
