// Trendpreise direkt aus Cardmarkets öffentlicher Preisliste (täglich gegen
// 2:45 Uhr neu erstellt). Scryfall übernimmt dieselben Trendpreise, aber
// etwa einen Tag später – deshalb holt der nächtliche Preisabgleich sie hier
// direkt. Verknüpft wird über Cardmarkets Produktnummer (cardmarket_id im
// Katalog bzw. bei Scryfall).

export const PRICE_GUIDE_URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json";

export type TrendPrice = { eur: number | null; eurFoil: number | null };

type GuideEntry = { idProduct: number; trend?: number | null; "trend-foil"?: number | null };

const positive = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);

/** Preisliste (JSON) → Trendpreis je Produktnummer; Einträge ohne jeden Trendpreis fehlen (rein). */
export function parsePriceGuide(json: unknown): { createdAt: string | null; prices: Map<number, TrendPrice> } {
  const prices = new Map<number, TrendPrice>();
  const root = json as { createdAt?: string; priceGuides?: GuideEntry[] } | null;
  for (const p of root?.priceGuides ?? []) {
    if (typeof p?.idProduct !== "number") continue;
    const eur = positive(p.trend);
    const eurFoil = positive(p["trend-foil"]);
    if (eur != null || eurFoil != null) prices.set(p.idProduct, { eur, eurFoil });
  }
  return { createdAt: root?.createdAt ?? null, prices };
}

/**
 * Trendpreise für Scryfall-Drucke: wo es eine Produktnummer mit Trendpreis
 * gibt, gilt der Cardmarket-Wert; fehlt dort nur Normal oder nur Foil, bleibt
 * der bisherige Wert für diese Seite stehen (rein).
 */
export function applyTrendPrices(
  prices: Map<string, TrendPrice>,
  cardmarketIds: Map<string, number>,
  guide: Map<number, TrendPrice>,
): number {
  let applied = 0;
  for (const [scryfallId, cmId] of cardmarketIds) {
    const t = guide.get(cmId);
    if (!t) continue;
    const before = prices.get(scryfallId);
    prices.set(scryfallId, { eur: t.eur ?? before?.eur ?? null, eurFoil: t.eurFoil ?? before?.eurFoil ?? null });
    applied++;
  }
  return applied;
}

/** Preisliste laden (Server). Wirft bei Fehlern – der Aufrufer fällt dann auf Scryfall zurück. */
export async function fetchPriceGuide(timeoutMs = 60_000): Promise<{ createdAt: string | null; prices: Map<number, TrendPrice> }> {
  const res = await fetch(PRICE_GUIDE_URL, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`Cardmarket-Preisliste: HTTP ${res.status}`);
  const parsed = parsePriceGuide(await res.json());
  if (parsed.prices.size < 10_000) throw new Error(`Cardmarket-Preisliste unvollständig (${parsed.prices.size} Einträge)`);
  return parsed;
}
