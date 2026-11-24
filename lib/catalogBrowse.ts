// Seite „Katalog“: alle Karten durchsuchen – mit denselben Filtern wie die
// Sammlung, gefiltert in der Datenbank (catalog_browse, Migration 034), weil
// über 30.000 Karten samt Regeltext nicht aufs Handy passen.
import type { FilterState } from "@/components/Filters";
import type { Card } from "@/lib/types";
import type { ScanMatch } from "@/lib/scanStack";
import { createClient } from "@/lib/supabase/client";

export const PAGE_SIZE = 60;

export type CatalogRow = {
  id: string;
  oracle_id: string | null;
  name: string;
  name_de: string | null;
  type_line: string | null;
  oracle_text: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string[] | null;
  rarity: string | null;
  set: string | null;
  set_name: string | null;
  collector_number: string | null;
  image_url: string | null;
  eur: number | string | null;
  eur_foil: number | string | null;
  edhrec_rank: number | null;
  total: number | string;
};

/** Filter der Seite → Parameter der Datenbankfunktion (rein) */
export function browseParams(f: FilterState, offset: number, limit = PAGE_SIZE) {
  return {
    p_search: f.search.trim(),
    p_in_text: !!f.inText,
    p_colors: f.colors,
    p_rarity: f.rarity,
    p_type: f.type.trim(),
    p_set: f.set,
    p_sort: f.sort,
    p_limit: limit,
    p_offset: offset,
  };
}

const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));

/** Katalogzeile → Kartenobjekt wie in der Sammlung (für dieselbe Darstellung; rein) */
export function rowToCard(r: CatalogRow): Card {
  return {
    id: r.id,
    user_id: "",
    scryfall_id: r.id,
    name: r.name,
    name_de: r.name_de ?? "",
    set_code: r.set,
    collector_number: r.collector_number,
    image_url: r.image_url,
    mana_cost: r.mana_cost,
    cmc: r.cmc,
    type_line: r.type_line,
    colors: r.colors ?? [],
    rarity: r.rarity,
    oracle_text: r.oracle_text,
    quantity: 1,
    foil: false,
    price_eur: num(r.eur),
    price_eur_foil: num(r.eur_foil),
    price_updated_at: null,
    condition: "NM",
    language: "EN",
    created_at: "",
  };
}

/**
 * Andere Version derselben Karte anzeigen: nur die druckbezogenen Felder wechseln.
 * `id` bleibt (Eintrag in der Liste, offenes Kartendetail), `scryfall_id` ist der Druck. (rein)
 */
export function withPrint(card: Card, p: ScanMatch): Card {
  return {
    ...card,
    scryfall_id: p.id,
    set_code: p.set ?? card.set_code,
    collector_number: p.collectorNumber ?? card.collector_number,
    image_url: p.imageUrl ?? card.image_url,
    price_eur: p.eur,
    price_eur_foil: p.eurFoil,
  };
}

/** Eine Seite Treffer laden (Browser). */
export async function fetchCatalogPage(f: FilterState, offset: number, attempts = 2): Promise<{ cards: Card[]; total: number } | null> {
  let { data, error } = await createClient().rpc("catalog_browse", browseParams(f, offset));
  // Mobilnetz: eine abgebrochene Anfrage einmal wiederholen
  for (let i = 1; error && i < attempts; i++) {
    await new Promise((r) => setTimeout(r, 800 * i));
    ({ data, error } = await createClient().rpc("catalog_browse", browseParams(f, offset)));
  }
  if (error) return null;
  const rows = (data ?? []) as CatalogRow[];
  return { cards: rows.map(rowToCard), total: rows.length ? Number(rows[0].total) : 0 };
}
