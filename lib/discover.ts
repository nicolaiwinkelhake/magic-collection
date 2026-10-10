import type { SupabaseClient } from "@supabase/supabase-js";
import { buildListSpecs } from "@/lib/commanderLists";
import { sortIdentity } from "@/lib/colorIdentity";
import { selectAll } from "@/lib/supabase/selectAll";

// Hilfen für die Entdecken-Seite.

export function identityKey(identity: string[]): string {
  return sortIdentity(identity).join("") || "C";
}

// Kartenpool für "Wie gut kann ich das bauen?": die allgemeinen Listen der
// Commander-Seite (ohne Themen und neue Karten) – gleich für alle Commander
// derselben Farbidentität, daher gut cachebar und ohne Claude-Aufruf.
export function buildablePoolSpecs(identity: string[]) {
  return buildListSpecs(identity, []).filter((s) => s.key !== "new");
}

export type BuildScore = { owned: number; total: number; share: number; missingValue: number };

export function scorePool(
  pool: Array<{ name: string; eur: number | null }>,
  ownedNames: Set<string>
): BuildScore {
  const unique = Array.from(new Map(pool.map((c) => [c.name, c])).values());
  let owned = 0;
  let missingValue = 0;
  for (const c of unique) {
    if (ownedNames.has(c.name)) owned += 1;
    else missingValue += c.eur ?? 0;
  }
  return {
    owned,
    total: unique.length,
    share: unique.length ? owned / unique.length : 0,
    missingValue: Math.round(missingValue * 100) / 100,
  };
}

// Mengen je Kartenname in der eigenen Sammlung (für viele Namen gebündelt).
export async function ownedQuantities(
  supabase: SupabaseClient,
  userId: string,
  names: string[]
): Promise<Map<string, number>> {
  const qty = new Map<string, number>();
  const unique = Array.from(new Set(names));
  for (let i = 0; i < unique.length; i += 150) {
    const rows = await selectAll<{ name: string; quantity: number }>(() =>
      supabase.from("cards").select("name, quantity").eq("user_id", userId).in("name", unique.slice(i, i + 150)).order("id")
    );
    for (const r of rows) qty.set(r.name, (qty.get(r.name) ?? 0) + r.quantity);
  }
  return qty;
}

// Kreaturentyp für eine Scryfall-Suche absichern (nur Buchstaben, Bindestrich, Leerzeichen).
export function sanitizeType(input: string): string | null {
  const t = input.trim();
  return /^[A-Za-zÀ-ÿ' -]{2,30}$/.test(t) ? t : null;
}

// Passt eine Karte farblich in ein Deck (Identität Teilmenge)?
export function fitsIdentity(card: string[], deck: string[]): boolean {
  return card.every((c) => deck.includes(c));
}
