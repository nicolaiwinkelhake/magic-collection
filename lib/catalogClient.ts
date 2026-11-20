"use client";

// Karten-Katalog im Browser (Scanner, Druckauswahl): direkt aus der eigenen
// Datenbank statt bei Scryfall. Liefert null bzw. [] (→ Aufrufer fragt
// Scryfall), solange der Katalog nicht freigeschaltet ist oder nicht
// antwortet. Lesbar für angemeldete Nutzer (RLS).
import { createClient } from "@/lib/supabase/client";
import type { ScanMatch } from "@/lib/scanStack";
import { catalogUsable, type CatalogMetaRows } from "@/lib/catalogState";

type Row = {
  id: string;
  oracle_id: string | null;
  name: string;
  name_de: string | null;
  set: string;
  set_name: string | null;
  collector_number: string;
  type_line: string | null;
  image_url: string | null;
  eur: number | string | null;
  eur_foil: number | string | null;
  released_at: string | null;
};
const COLS = "id, oracle_id, name, name_de, set, set_name, collector_number, type_line, image_url, eur, eur_foil, released_at";

export type CatalogPrint = ScanMatch & { releasedAt?: string; nameDe?: string | null };

let client: ReturnType<typeof createClient> | null = null;
const db = () => (client ??= createClient());

// Freigabe einmal je Sitzung prüfen (gleiche Bedingung wie auf dem Server)
let readyP: Promise<boolean> | null = null;
export function catalogReady(): Promise<boolean> {
  readyP ??= (async () => {
    try {
      const { data } = await db().from("catalog_meta").select("key, value").in("key", ["cards", "defaults", "lookup"]);
      return catalogUsable(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as CatalogMetaRows);
    } catch {
      return false;
    }
  })();
  return readyP;
}

const num = (v: number | string | null) => (v == null ? null : Number(v));

export function rowToMatch(r: Row, exact: boolean): CatalogPrint {
  return {
    id: r.id,
    name: r.name,
    imageUrl: r.image_url,
    eur: num(r.eur),
    eurFoil: num(r.eur_foil),
    typeLine: r.type_line ?? undefined,
    set: r.set,
    setName: r.set_name,
    collectorNumber: r.collector_number,
    exact,
    releasedAt: r.released_at ?? undefined,
    nameDe: r.name_de,
  };
}

/** Genauer Druck über Set + Sammlernummer. */
export async function catalogPrint(set: string, number: string): Promise<CatalogPrint | null> {
  if (!(await catalogReady())) return null;
  try {
    const { data } = await db().from("catalog_cards").select(COLS).eq("set", set.toLowerCase()).eq("collector_number", number).maybeSingle();
    return data ? rowToMatch(data as Row, true) : null;
  } catch {
    return null;
  }
}

/** Exakter Name (englisch, Vorderseite oder deutsch) → Standarddruck wie bei Scryfall. */
export async function catalogExact(name: string): Promise<CatalogPrint | null> {
  if (!name.trim() || !(await catalogReady())) return null;
  try {
    const { data: hits } = await db().rpc("catalog_lookup_names", { p_names: [name] });
    const hit = (hits ?? [])[0] as { card_id: string | null; oracle_id: string } | undefined;
    if (!hit) return null;
    if (hit.card_id) {
      const { data } = await db().from("catalog_cards").select(COLS).eq("id", hit.card_id).maybeSingle();
      if (data) return rowToMatch(data as Row, false);
    }
    // ohne Standarddruck-Eintrag: neuester Druck
    const { data } = await db().from("catalog_cards").select(COLS).eq("oracle_id", hit.oracle_id).order("released_at", { ascending: false }).limit(1);
    return data?.[0] ? rowToMatch(data[0] as Row, false) : null;
  } catch {
    return null;
  }
}

/** Alle Drucke einer Karte (englischer Name), neueste zuerst. */
export async function catalogPrints(name: string): Promise<CatalogPrint[]> {
  if (!(await catalogReady())) return [];
  try {
    const { data: hits } = await db().rpc("catalog_lookup_names", { p_names: [name] });
    const oracle = ((hits ?? [])[0] as { oracle_id: string } | undefined)?.oracle_id;
    if (!oracle) return [];
    const { data } = await db()
      .from("catalog_cards")
      .select(COLS)
      .eq("oracle_id", oracle)
      .order("released_at", { ascending: false })
      .order("collector_number", { ascending: true })
      .limit(1200);
    return ((data ?? []) as Row[]).map((r) => rowToMatch(r, true));
  } catch {
    return [];
  }
}

/** Alle Drucke eines Sets, nach Sammlernummer (Set-Vollständigkeit). */
export async function catalogSetPrints(set: string): Promise<CatalogPrint[]> {
  if (!(await catalogReady())) return [];
  try {
    const { data } = await db().from("catalog_cards").select(COLS).eq("set", set.toLowerCase()).limit(2000);
    return sortByNumber(((data ?? []) as Row[]).map((r) => rowToMatch(r, true)));
  } catch {
    return [];
  }
}

/** Sammlernummern natürlich sortieren ("2" vor "10", "10a" nach "10"). */
export function sortByNumber<T extends { collectorNumber?: string }>(list: T[]): T[] {
  const key = (n = "") => [parseInt(n.replace(/^\D+/, ""), 10) || 0, n] as const;
  return [...list].sort((a, b) => {
    const [na, sa] = key(a.collectorNumber);
    const [nb, sb] = key(b.collectorNumber);
    return na - nb || sa.localeCompare(sb);
  });
}
