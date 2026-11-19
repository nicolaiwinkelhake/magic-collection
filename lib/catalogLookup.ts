// Karten im eigenen Katalog nachschlagen (serverseitig) – zuerst hier, nur
// was fehlt, fragt der Aufrufer weiter bei Scryfall nach. Ergebnisse im
// Scryfall-Format, damit die bestehenden Abläufe unverändert bleiben.
// Ohne Datenbankzugang (z. B. Tests/Build) liefert alles "nichts gefunden".
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScryfallCard } from "@/lib/scryfall";
import { pickDefaultPrint } from "@/lib/catalogPick";
import { CATALOG_VERSION } from "@/lib/catalog";

export type CatalogCardRow = {
  id: string;
  oracle_id: string | null;
  name: string;
  name_de: string | null;
  set: string;
  set_name: string | null;
  collector_number: string;
  rarity: string | null;
  layout: string | null;
  type_line: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  produced_mana: string[] | null;
  oracle_text: string | null;
  image_url: string | null;
  eur: number | string | null;
  eur_foil: number | string | null;
  released_at: string | null;
  edhrec_rank: number | null;
  game_changer: boolean | null;
  promo: boolean | null;
  set_type: string | null;
  frame_effects: string[] | null;
  border_color: string | null;
  full_art: boolean | null;
  variation: boolean | null;
  oversized: boolean | null;
  textless: boolean | null;
  lang: string | null;
};

export const CATALOG_COLUMNS =
  "id, oracle_id, name, name_de, set, set_name, collector_number, rarity, layout, type_line, mana_cost, cmc, colors, color_identity, produced_mana, oracle_text, image_url, eur, eur_foil, released_at, edhrec_rank, game_changer, promo, set_type, frame_effects, border_color, full_art, variation, oversized, textless, lang";

const str = (v: number | string | null) => (v == null ? null : String(v));

/** Katalogzeile → Scryfall-Kartenobjekt (nur die Felder, die die App nutzt). */
export function catalogToScryfall(r: CatalogCardRow): ScryfallCard & { set_name?: string; edhrec_rank?: number; game_changer?: boolean; released_at?: string } {
  const img = r.image_url ?? undefined;
  return {
    id: r.id,
    oracle_id: r.oracle_id ?? undefined,
    name: r.name,
    set: r.set,
    set_name: r.set_name ?? undefined,
    collector_number: r.collector_number,
    mana_cost: r.mana_cost ?? undefined,
    cmc: r.cmc ?? 0,
    type_line: r.type_line ?? "",
    colors: r.colors ?? undefined,
    color_identity: r.color_identity ?? undefined,
    produced_mana: r.produced_mana ?? undefined,
    rarity: r.rarity ?? "",
    oracle_text: r.oracle_text ?? undefined,
    prices: { eur: str(r.eur), eur_foil: str(r.eur_foil) },
    image_uris: img ? { small: img, normal: img, large: img, png: img } : undefined,
    edhrec_rank: r.edhrec_rank ?? undefined,
    game_changer: r.game_changer ?? undefined,
    released_at: r.released_at ?? undefined,
  };
}

const key = (n: string) => n.trim().toLowerCase();

let admin: SupabaseClient | null | undefined;
let ready: { ok: boolean; at: number } | null = null;

/**
 * Lesezugriff auf den Katalog (Service-Key, nur serverseitig). null, wenn
 * nicht konfiguriert oder der Katalog (noch) nicht vollständig im aktuellen
 * Stand ist – dann fragen die Aufrufer wie bisher Scryfall.
 */
export async function catalogDb(): Promise<SupabaseClient | null> {
  if (admin === undefined) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) admin = null;
    else admin = (await import("@/lib/supabase/admin")).createAdminClient();
  }
  if (!admin) return null;
  if (!ready || Date.now() - ready.at > 10 * 60_000) {
    const { data } = await admin.from("catalog_meta").select("key, value").in("key", ["cards", "defaults", "lookup"]);
    const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value as { done?: boolean; version?: number; enabled?: boolean }]));
    // "lookup": Schalter, der nach einer Stichprobe gegen Scryfall gesetzt wird
    ready = { ok: !!m.lookup?.enabled && !!m.cards?.done && (m.cards.version ?? 0) >= CATALOG_VERSION && !!m.defaults?.done, at: Date.now() };
  }
  return ready.ok ? admin : null;
}

async function rowsWhere(db: SupabaseClient, col: string, values: string[]): Promise<CatalogCardRow[]> {
  const out: CatalogCardRow[] = [];
  for (let i = 0; i < values.length; i += 150) {
    const { data, error } = await db.from("catalog_cards").select(CATALOG_COLUMNS).in(col, values.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as CatalogCardRow[]));
  }
  return out;
}

/** Drucke per Scryfall-ID. */
export async function catalogByIds(ids: string[]): Promise<Map<string, ScryfallCard>> {
  const out = new Map<string, ScryfallCard>();
  const db = await catalogDb().catch(() => null);
  if (!db || !ids.length) return out;
  try {
    for (const r of await rowsWhere(db, "id", Array.from(new Set(ids.map((x) => x.toLowerCase()))))) out.set(r.id.toLowerCase(), catalogToScryfall(r));
  } catch {
    // Katalog nicht erreichbar → Aufrufer fragt Scryfall
  }
  return out;
}

/** Drucke per Set + Sammlernummer; Schlüssel "set|nummer" (klein). */
export async function catalogBySetNumber(pairs: Array<{ set: string; number: string }>): Promise<Map<string, ScryfallCard>> {
  const out = new Map<string, ScryfallCard>();
  const db = await catalogDb().catch(() => null);
  if (!db || !pairs.length) return out;
  try {
    const bySet = new Map<string, Set<string>>();
    for (const p of pairs) {
      const s = p.set.toLowerCase();
      if (!bySet.has(s)) bySet.set(s, new Set());
      bySet.get(s)!.add(p.number);
    }
    for (const [set, nums] of bySet) {
      const { data, error } = await db.from("catalog_cards").select(CATALOG_COLUMNS).eq("set", set).in("collector_number", Array.from(nums));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as unknown as CatalogCardRow[]) out.set(`${r.set}|${r.collector_number}`, catalogToScryfall(r));
    }
  } catch {
    // Katalog nicht erreichbar → Aufrufer fragt Scryfall
  }
  return out;
}

/**
 * Exakte Namen (englisch, auch nur Vorderseite, oder gedruckter deutscher
 * Name) → Standarddruck wie bei Scryfalls Namenssuche. Schlüssel: Eingabe
 * (klein, getrimmt). Nicht gefundene Namen fehlen in der Antwort.
 */
export async function catalogByNames(names: string[]): Promise<Map<string, ScryfallCard>> {
  const out = new Map<string, ScryfallCard>();
  const db = await catalogDb().catch(() => null);
  const wanted = Array.from(new Set(names.map(key).filter(Boolean)));
  if (!db || !wanted.length) return out;
  try {
    const hits: Array<{ input: string; oracle_id: string; card_id: string | null }> = [];
    for (let i = 0; i < wanted.length; i += 200) {
      const { data, error } = await db.rpc("catalog_lookup_names", { p_names: wanted.slice(i, i + 200) });
      if (error) throw new Error(error.message);
      hits.push(...((data ?? []) as typeof hits));
    }
    if (!hits.length) return out;
    const byId = new Map((await rowsWhere(db, "id", hits.map((h) => h.card_id).filter((x): x is string => !!x))).map((r) => [r.id, r]));
    // ohne Standarddruck-Eintrag (selten, z. B. ganz neue Karte): selbst wählen
    const missing = Array.from(new Set(hits.filter((h) => !h.card_id || !byId.has(h.card_id)).map((h) => h.oracle_id)));
    const fallback = new Map<string, CatalogCardRow>();
    if (missing.length) {
      const all = await rowsWhere(db, "oracle_id", missing);
      for (const o of missing) {
        const pick = pickDefaultPrint(all.filter((r) => r.oracle_id === o));
        if (pick) fallback.set(o, pick);
      }
    }
    for (const h of hits) {
      const row = (h.card_id ? byId.get(h.card_id) : undefined) ?? fallback.get(h.oracle_id);
      if (row) out.set(h.input, catalogToScryfall(row));
    }
  } catch {
    // Katalog nicht erreichbar → Aufrufer fragt Scryfall
  }
  return out;
}
