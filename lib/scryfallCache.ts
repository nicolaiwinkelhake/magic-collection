import type { SupabaseClient } from "@supabase/supabase-js";
import { sleep } from "@/lib/scryfall";

// Scryfall-Suche mit globalem Zwischenspeicher (Tabelle scryfall_cache,
// Migration 010). Gespeichert werden nur kompakte Kartenfelder.

const SCRYFALL_BASE = "https://api.scryfall.com";
const DEFAULT_TTL_DAYS = 7;

export type CompactCard = {
  id: string;
  name: string;
  image: string | null;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  colorIdentity: string[];
  eur: number | null;
  eurFoil: number | null;
  edhrecRank: number | null;
  gameChanger: boolean;
  releasedAt: string | null;
};

type RawCard = {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  color_identity?: string[];
  edhrec_rank?: number;
  game_changer?: boolean;
  released_at?: string;
  prices?: { eur?: string | null; eur_foil?: string | null };
  image_uris?: { normal?: string };
  card_faces?: Array<{ image_uris?: { normal?: string }; mana_cost?: string }>;
};

export function compactCard(c: RawCard): CompactCard {
  return {
    id: c.id,
    name: c.name,
    image: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
    manaCost: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? null,
    cmc: c.cmc ?? 0,
    typeLine: c.type_line ?? "",
    colorIdentity: c.color_identity ?? [],
    eur: c.prices?.eur ? parseFloat(c.prices.eur) : null,
    eurFoil: c.prices?.eur_foil ? parseFloat(c.prices.eur_foil) : null,
    edhrecRank: c.edhrec_rank ?? null,
    gameChanger: Boolean(c.game_changer),
    releasedAt: c.released_at ?? null,
  };
}

// Direkte Scryfall-Suche (mehrere Seiten bis limit). null = nicht erreichbar.
export async function scryfallSearch(
  query: string,
  opts: { order?: string; limit?: number; unique?: "cards" | "prints" } = {}
): Promise<CompactCard[] | null> {
  const limit = opts.limit ?? 60;
  // Günstigsten Druck mit Euro-Preis bevorzugen (sonst fehlt oft der Preis).
  const q = query.includes("prefer:") ? query : `${query} prefer:eur-low`;
  const params = new URLSearchParams({ q, unique: opts.unique ?? "cards", order: opts.order ?? "edhrec" });
  let url: string | null = `${SCRYFALL_BASE}/cards/search?${params}`;
  const out: CompactCard[] = [];
  while (url && out.length < limit) {
    let page: { data?: RawCard[]; has_more?: boolean; next_page?: string } | null = null;
    for (let attempt = 0; attempt < 3 && !page; attempt++) {
      try {
        const res: Response = await fetch(url, { headers: { "User-Agent": "MagicCollectionApp/1.0" } });
        if (res.status === 404) return out; // keine Treffer
        if (res.ok) page = await res.json();
        else if (res.status === 400) return out; // ungültige Suche
      } catch {
        // Netzwerkfehler -> Retry
      }
      if (!page) await sleep(800 * (attempt + 1));
    }
    if (!page) return null;
    out.push(...(page.data ?? []).map(compactCard));
    url = page.has_more && page.next_page ? page.next_page : null;
    if (url) await sleep(100);
  }
  return out.slice(0, limit);
}

// Suche über den Cache. Abgelaufene oder fehlende Einträge werden frisch
// geladen; ist Scryfall nicht erreichbar, wird ein alter Eintrag genutzt.
export async function cachedSearch(
  supabase: SupabaseClient,
  query: string,
  opts: { order?: string; limit?: number; ttlDays?: number } = {}
): Promise<CompactCard[]> {
  const key = JSON.stringify({ q: query, o: opts.order ?? "edhrec", l: opts.limit ?? 60 });
  const { data: row } = await supabase.from("scryfall_cache").select("data, fetched_at").eq("key", key).maybeSingle();
  const ttlMs = (opts.ttlDays ?? DEFAULT_TTL_DAYS) * 86400_000;
  if (row && Date.now() - new Date(row.fetched_at as string).getTime() < ttlMs) {
    return row.data as CompactCard[];
  }
  const fresh = await scryfallSearch(query, opts);
  if (fresh === null) return (row?.data as CompactCard[] | undefined) ?? [];
  await supabase.rpc("save_scryfall_cache", { p_key: key, p_data: fresh });
  return fresh;
}

// Scryfall-Farbfilter für eine Farbidentität ("id<=wub"; farblos = "id<=c").
export function identityFilter(identity: string[]): string {
  return identity.length ? `id<=${identity.join("").toLowerCase()}` : "id<=c";
}
