// Datenbeschaffung für "Entdecken" (serverseitig): eigene Decks, Bestand,
// geteilte Sammlungen der Freunde, Kartenrollen und Kartendaten – jeweils
// gebündelt und, wo möglich, gecacht.
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "@/lib/supabase/selectAll";
import { fetchCardRoles, NAMES_PER_QUERY, type CardRole } from "@/lib/cardRoles";
import { fetchCardsCollection, getPrices, type ScryfallCard } from "@/lib/scryfall";
import type { Availability, CandidateInfo, DoctorDeckCard, FriendCopy } from "@/lib/deckDoctor";

export type MyDeck = {
  id: string;
  name: string;
  commander_name: string;
  partner_name: string | null;
  commander_image_url: string | null;
  color_identity: string[];
  cards: DoctorDeckCard[];
};

export async function loadMyDecks(supabase: SupabaseClient, userId: string): Promise<MyDeck[]> {
  const { data: decks } = await supabase
    .from("decks")
    .select("id, name, commander_name, partner_name, commander_image_url, color_identity")
    .eq("user_id", userId)
    .order("created_at");
  if (!decks?.length) return [];
  const rows = await selectAll<DoctorDeckCard & { deck_id: string }>(() =>
    supabase
      .from("deck_cards")
      .select("deck_id, name, type_line, cmc, is_commander")
      .eq("user_id", userId)
      .order("id"),
  ).catch(() => []);
  return decks.map((d) => ({
    ...(d as Omit<MyDeck, "cards">),
    color_identity: (d.color_identity as string[] | null) ?? [],
    cards: rows.filter((r) => r.deck_id === d.id),
  }));
}

export function commandersOf(deck: Pick<MyDeck, "commander_name" | "partner_name">): string[] {
  return [deck.commander_name, deck.partner_name].filter((x): x is string => !!x);
}

export type MyCard = {
  id: string;
  name: string;
  quantity: number;
  type_line: string | null;
  image_url: string | null;
  price_eur: number | null;
  rarity: string | null;
  oracle_text: string | null;
};

export async function loadMyCards(supabase: SupabaseClient, userId: string): Promise<MyCard[]> {
  return selectAll<MyCard>(() =>
    supabase
      .from("cards")
      .select("id, name, quantity, type_line, image_url, price_eur, rarity, oracle_text")
      .eq("user_id", userId)
      .order("id"),
  ).catch(() => []);
}

/** Eigene Exemplare je Name: gesamt und frei (nicht in einem Deck verbaut). */
export function ownership(cards: MyCard[], decks: MyDeck[]): Map<string, { owned: number; free: number }> {
  const used = new Map<string, number>();
  for (const d of decks) for (const c of d.cards) used.set(c.name, (used.get(c.name) ?? 0) + 1);
  const out = new Map<string, { owned: number; free: number }>();
  for (const c of cards) {
    const prev = out.get(c.name) ?? { owned: 0, free: 0 };
    prev.owned += c.quantity;
    out.set(c.name, prev);
  }
  for (const [name, v] of out) v.free = Math.max(0, v.owned - (used.get(name) ?? 0));
  return out;
}

export const displayName = (email: string) => email.split("@")[0];

/** Karten aller Freunde, die ihre Sammlung mit mir teilen (Name → Exemplare). */
export async function loadFriendCards(supabase: SupabaseClient): Promise<{ byName: Map<string, FriendCopy[]>; sharing: number }> {
  const { data: owners } = await supabase.rpc("collections_shared_with_me");
  const byName = new Map<string, FriendCopy[]>();
  for (const o of (owners ?? []) as Array<{ owner_id: string; owner_email: string }>) {
    type Row = FriendCopy["card"];
    const rows = await selectAll<Row>(
      () =>
        supabase
          .rpc("shared_collection", { p_owner: o.owner_id })
          .select("id, name, image_url, foil, quantity, price_eur, price_eur_foil, set_code")
          .order("name")
          .order("id") as unknown as { range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: { message: string } | null }> },
    ).catch(() => [] as Row[]);
    for (const card of rows) {
      const list = byName.get(card.name) ?? [];
      list.push({ ownerId: o.owner_id, ownerName: displayName(o.owner_email), card });
      byName.set(card.name, list);
    }
  }
  return { byName, sharing: (owners ?? []).length };
}

export function availabilityFor(
  names: string[],
  own: Map<string, { owned: number; free: number }>,
  friends: Map<string, FriendCopy[]>,
): Map<string, Availability> {
  const out = new Map<string, Availability>();
  for (const n of names) {
    const o = own.get(n);
    out.set(n, { owned: o?.owned ?? 0, free: o?.free ?? 0, friends: friends.get(n) ?? [] });
  }
  return out;
}

/**
 * Kartenrollen aus dem Cache (card_roles); fehlende werden – begrenzt – bei
 * Scryfall nachgeschlagen und gespeichert.
 */
export async function loadRoles(supabase: SupabaseClient, names: string[], fetchMax = NAMES_PER_QUERY * 2): Promise<Map<string, CardRole[]>> {
  const unique = Array.from(new Set(names.filter(Boolean)));
  const roles = new Map<string, CardRole[]>();
  for (let i = 0; i < unique.length; i += 150) {
    const { data } = await supabase.from("card_roles").select("name, roles").in("name", unique.slice(i, i + 150));
    for (const r of data ?? []) roles.set(r.name as string, r.roles as CardRole[]);
  }
  const missing = unique.filter((n) => !roles.has(n)).slice(0, fetchMax);
  if (missing.length) {
    const fetched = await fetchCardRoles(missing).catch(() => new Map<string, CardRole[]>());
    if (fetched.size) {
      const payload = Array.from(fetched, ([name, r]) => ({ name, roles: r }));
      await supabase.rpc("save_card_roles", { p_roles: payload });
      for (const { name, roles: r } of payload) roles.set(name, r);
    }
  }
  return roles;
}

const INFO_TTL_DAYS = 7;

function toInfo(c: ScryfallCard): CandidateInfo {
  const { eur } = getPrices(c);
  return {
    typeLine: c.type_line ?? "",
    cmc: c.cmc ?? 0,
    eur,
    image: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
    identity: c.color_identity ?? [],
  };
}

/** Typ, Manawert, Preis, Bild, Farbidentität je Name (gecacht, 7 Tage). */
export async function loadCardInfo(supabase: SupabaseClient, names: string[]): Promise<Map<string, CandidateInfo>> {
  const unique = Array.from(new Set(names.filter(Boolean)));
  const out = new Map<string, CandidateInfo>();
  const key = (n: string) => `cardinfo:${n}`;
  for (let i = 0; i < unique.length; i += 150) {
    const { data } = await supabase
      .from("scryfall_cache")
      .select("key, data, fetched_at")
      .in("key", unique.slice(i, i + 150).map(key));
    for (const r of data ?? []) {
      if (Date.now() - new Date(r.fetched_at as string).getTime() < INFO_TTL_DAYS * 86400_000) {
        out.set((r.key as string).slice("cardinfo:".length), r.data as CandidateInfo);
      }
    }
  }
  const missing = unique.filter((n) => !out.has(n));
  if (missing.length) {
    const found = await fetchCardsCollection(missing.map((name) => ({ name }))).catch(() => new Map<string, ScryfallCard>());
    const saves: Array<PromiseLike<unknown>> = [];
    for (const c of found.values()) {
      const info = toInfo(c);
      // Doppelseitige Karten: Scryfall liefert "A // B", EDHREC meist "A // B" oder "A"
      for (const n of [c.name, c.name.split(" // ")[0]]) {
        if (missing.includes(n) && !out.has(n)) {
          out.set(n, info);
          saves.push(supabase.rpc("save_scryfall_cache", { p_key: key(n), p_data: info }));
        }
      }
    }
    for (let i = 0; i < saves.length; i += 10) await Promise.all(saves.slice(i, i + 10));
  }
  return out;
}
