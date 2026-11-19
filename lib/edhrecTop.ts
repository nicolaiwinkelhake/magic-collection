// EDHREC "Top Commanders – Past 2 Years": die beliebtesten Commander der
// letzten zwei Jahre (nach Anzahl Decks), seitenweise je 100. Gecacht wie
// alle EDHREC-Seiten (7 Tage, scryfall_cache "edhrec:top:year:<seite>").
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedPage, type RawPage } from "@/lib/edhrec";

export type TopCommander = {
  rank: number;
  name: string;
  slug: string;
  /** Anzahl Decks auf EDHREC (letzte 2 Jahre) */
  decks: number;
};

type RawTop = RawPage & { cardviews?: Array<{ name?: string; slug?: string; sanitized?: string; num_decks?: number; rank?: number }> };

/** Rohe Seite → kompakte Liste (rein, getestet). Erste Seite und Folgeseiten haben verschiedene Formen. */
export function compactTopPage(raw: RawTop, page: number): TopCommander[] {
  const views = raw.cardviews ?? raw.container?.json_dict?.cardlists?.[0]?.cardviews ?? [];
  return (views as NonNullable<RawTop["cardviews"]>)
    .filter((v) => v?.name)
    .map((v, i) => ({
      rank: v.rank ?? page * 100 + i + 1,
      name: v.name!,
      slug: v.slug ?? v.sanitized ?? "",
      decks: v.num_decks ?? 0,
    }));
}

const pagePath = (page: number) => (page === 0 ? "commanders/year" : `commanders/year-past2years-${page}`);

/** Die ersten `pages` Seiten (je 100 Commander), gecacht; fehlende Seiten werden übersprungen. */
export async function getTopCommanders(supabase: SupabaseClient, pages = 1): Promise<TopCommander[]> {
  const out: TopCommander[][] = [];
  // höchstens 5 gleichzeitig – EDHREC schonen
  for (let start = 0; start < pages; start += 5) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(5, pages - start) }, (_, k) => start + k).map((p) =>
        cachedPage(supabase, `edhrec:top:year:${p}`, pagePath(p), (raw) => compactTopPage(raw as RawTop, p)).catch(() => null),
      ),
    );
    out.push(...batch.map((b) => b ?? []));
  }
  return out.flat().sort((a, b) => a.rank - b.rank);
}

/** Rang je Commander-Name (klein). Einzelne Partner aus Paaren bekommen den Rang des besten Paars, ein eigener Eintrag hat Vorrang. */
export function rankIndex(top: TopCommander[]): Map<string, TopCommander> {
  const own = new Map<string, TopCommander>();
  const viaPair = new Map<string, TopCommander>();
  for (const t of top) {
    own.set(t.name.toLowerCase(), own.get(t.name.toLowerCase()) ?? t);
    if (t.name.includes(" // ")) {
      for (const part of t.name.split(" // ")) {
        const k = part.trim().toLowerCase();
        const prev = viaPair.get(k);
        if (!prev || t.rank < prev.rank) viaPair.set(k, t);
      }
    }
  }
  for (const [k, t] of viaPair) if (!own.has(k)) own.set(k, t);
  return own;
}
