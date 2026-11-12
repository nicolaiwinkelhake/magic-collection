// EDHREC – Statistik aus über einer Million Commander-Decks. Wir nutzen nur
// gelegentliche, kurze Abfragen der öffentlichen JSON-Seiten und speichern
// das Ergebnis kompakt im Cache (scryfall_cache, Schlüssel "edhrec:…"),
// sodass jeder Commander höchstens einmal pro Woche abgefragt wird.
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = "https://json.edhrec.com/pages";
const TTL_DAYS = 7;
const TIMEOUT_MS = 10000;

/** Empfohlene Karte für einen Commander. */
export type EdhrecCard = {
  name: string;
  /** Anteil der Decks dieses Commanders, die die Karte spielen (0–1) */
  inclusion: number;
  /** Synergie: Anteil hier minus Anteil in allen Decks der Farben (−1…1) */
  synergy: number;
  /** Lift: wie viel häufiger als zufällig (1 = neutral) */
  lift: number;
  /** EDHREC-Kategorie, z. B. "manaartifacts", "creatures" */
  list: string;
};

export type EdhrecCommander = {
  name: string;
  slug: string;
  numDecks: number;
  cards: EdhrecCard[];
  /** häufigste Themen (Tags), z. B. Sacrifice, Treasure */
  themes: Array<{ slug: string; name: string; count: number }>;
  /** durchschnittliche Anzahl je Kartentyp (inkl. "land") */
  types: Record<string, number>;
  similar: string[];
};

/** EDHREC-Seitenname: "Korvold, Fae-Cursed King" → "korvold-fae-cursed-king". */
export function edhrecSlug(name: string): string {
  const front = name.split(" // ")[0];
  return front
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Seite für einen oder zwei Commander (Partner alphabetisch). */
export function commanderSlug(names: string[]): string {
  return names
    .filter(Boolean)
    .map(edhrecSlug)
    .sort()
    .join("-");
}

type RawCardview = { name: string; synergy?: number; lift?: number; num_decks?: number; potential_decks?: number };
type RawPage = {
  container?: { json_dict?: { card?: { num_decks?: number; name?: string }; cardlists?: Array<{ tag?: string; header?: string; cardviews?: RawCardview[] }> } };
  tag_counts?: Array<{ slug: string; value: string; count: number }>;
  similar?: string[];
  [type: string]: unknown;
};

const TYPE_KEYS = ["creature", "instant", "sorcery", "artifact", "enchantment", "planeswalker", "battle", "land", "basic", "nonbasic"];

/** Rohe EDHREC-Antwort → kompakte Form (rein, getestet). */
export function compactCommanderPage(raw: RawPage, slug: string): EdhrecCommander {
  const dict = raw.container?.json_dict ?? {};
  const best = new Map<string, EdhrecCard>();
  for (const list of dict.cardlists ?? []) {
    const tag = list.tag ?? "";
    // "Neue Karten" sind noch ohne aussagekräftige Statistik
    if (tag === "newcards") continue;
    for (const v of list.cardviews ?? []) {
      if (!v?.name) continue;
      const inclusion = v.potential_decks ? (v.num_decks ?? 0) / v.potential_decks : 0;
      const card: EdhrecCard = {
        name: v.name,
        inclusion: Math.round(inclusion * 1000) / 1000,
        synergy: Math.round((v.synergy ?? 0) * 1000) / 1000,
        lift: Math.round((v.lift ?? 1) * 100) / 100,
        list: tag,
      };
      const prev = best.get(v.name);
      // Spezifische Liste (z. B. manaartifacts) schlägt "topcards"/"highliftcards"
      if (!prev || ((prev.list === "topcards" || prev.list === "highliftcards") && tag !== "topcards" && tag !== "highliftcards")) {
        best.set(v.name, card);
      }
    }
  }
  const types: Record<string, number> = {};
  for (const k of TYPE_KEYS) if (typeof raw[k] === "number") types[k] = raw[k] as number;
  return {
    name: dict.card?.name ?? slug,
    slug,
    numDecks: dict.card?.num_decks ?? 0,
    cards: Array.from(best.values()),
    themes: (raw.tag_counts ?? []).slice(0, 8).map((t) => ({ slug: t.slug, name: t.value, count: t.count })),
    types,
    similar: (raw.similar ?? []).slice(0, 8),
  };
}

// null = nicht erreichbar (später erneut), "notfound" = EDHREC kennt die Seite nicht
async function fetchJson(path: string): Promise<RawPage | "notfound" | null> {
  try {
    const res = await fetch(`${BASE}/${path}.json`, {
      headers: { Accept: "application/json", "User-Agent": "MagicCollectionApp/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 403 || res.status === 404) return "notfound";
    if (!res.ok) return null;
    return (await res.json()) as RawPage;
  } catch {
    return null;
  }
}

/**
 * Commander-Seite (gecacht). null = EDHREC kennt den Commander nicht oder
 * ist nicht erreichbar (dann wird ein alter Cache-Eintrag genutzt).
 */
export async function getCommander(
  supabase: SupabaseClient,
  commanderNames: string[],
  opts: { cacheOnly?: boolean } = {},
): Promise<EdhrecCommander | null> {
  const slug = commanderSlug(commanderNames);
  if (!slug) return null;
  const key = `edhrec:commander:${slug}`;
  const { data: row } = await supabase.from("scryfall_cache").select("data, fetched_at").eq("key", key).maybeSingle();
  const fresh = row && Date.now() - new Date(row.fetched_at as string).getTime() < TTL_DAYS * 86400_000;
  const cached = row ? (row.data as EdhrecCommander | { missing: true }) : null;
  const fromCache = cached && "missing" in cached ? null : (cached as EdhrecCommander | null);
  if (row && (fresh || opts.cacheOnly)) return fromCache;
  if (opts.cacheOnly) return null;
  const raw = await fetchJson(`commanders/${slug}`);
  if (raw === null) return fromCache;
  if (raw === "notfound") {
    // Unbekannt merken, damit wir nicht bei jedem Aufruf erneut fragen
    await supabase.rpc("save_scryfall_cache", { p_key: key, p_data: { missing: true } });
    return null;
  }
  const page = compactCommanderPage(raw, slug);
  await supabase.rpc("save_scryfall_cache", { p_key: key, p_data: page });
  return page;
}

/** Ist die Seite schon im (frischen) Cache? – für schrittweises Nachladen. */
export async function cachedCommanderSlugs(supabase: SupabaseClient, slugs: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const keys = slugs.map((s) => `edhrec:commander:${s}`);
  for (let i = 0; i < keys.length; i += 150) {
    const { data } = await supabase.from("scryfall_cache").select("key, fetched_at").in("key", keys.slice(i, i + 150));
    for (const r of data ?? []) {
      if (Date.now() - new Date(r.fetched_at as string).getTime() < TTL_DAYS * 86400_000) out.add((r.key as string).slice("edhrec:commander:".length));
    }
  }
  return out;
}
