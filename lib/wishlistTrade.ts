// Trade aus der Wunschliste (rein, getestet): aus der freigegebenen Sammlung
// des Freundes je gewünschter Karte ein Exemplar in den Trade-Korb legen.
import { addToBasket, type Basket, type BasketCard } from "@/lib/tradeBasket";

/**
 * Pro Kartenname ein Exemplar des Freundes: Nicht-Foil vor Foil, dann das
 * günstigere, dann nach ID (stabil). `missing` = gewünschte Karten, die in der
 * (freigegebenen) Sammlung des Freundes nicht (mehr) vorkommen.
 */
export function basketFromFriendCopies(rows: BasketCard[], wanted: string[]): { basket: Basket; missing: string[] } {
  const byName = new Map<string, BasketCard[]>();
  for (const r of rows) {
    if (r.quantity < 1) continue;
    (byName.get(r.name) ?? byName.set(r.name, []).get(r.name)!).push(r);
  }
  const price = (c: BasketCard) => (c.foil ? c.price_eur_foil ?? c.price_eur : c.price_eur) ?? Infinity;
  const picks: BasketCard[] = [];
  const missing: string[] = [];
  for (const name of Array.from(new Set(wanted))) {
    const copies = byName.get(name);
    if (!copies?.length) {
      missing.push(name);
      continue;
    }
    copies.sort((a, b) => Number(a.foil) - Number(b.foil) || price(a) - price(b) || a.id.localeCompare(b.id));
    picks.push(copies[0]);
  }
  return { basket: addToBasket([], picks), missing };
}
