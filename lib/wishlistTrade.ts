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
  const price = (c: BasketCard) => (c.foil ? c.price_eur_foil ?? c.price_eur : c.price_eur ?? c.price_eur_foil) ?? Infinity;
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

/**
 * Markierte Wunschkarten auf Freunde verteilen – möglichst wenige Trades:
 * Wer die meisten der noch offenen Karten hat, bekommt sie alle; dann der
 * Nächste mit den übrigen (bei Gleichstand alphabetisch, damit es stabil ist).
 * `owners` = Kartenname → Freunde (nur die, mit denen ein Trade möglich ist).
 * `unassigned` = Karten, die keiner dieser Freunde hat.
 */
export function assignToFriends(
  names: string[],
  owners: Record<string, string[]>,
): { byFriend: Map<string, string[]>; unassigned: string[] } {
  const open = new Set(names);
  const unassigned = Array.from(open).filter((n) => !owners[n]?.length);
  for (const n of unassigned) open.delete(n);
  const byFriend = new Map<string, string[]>();
  while (open.size) {
    const count = new Map<string, number>();
    for (const n of open) for (const f of new Set(owners[n])) count.set(f, (count.get(f) ?? 0) + 1);
    const [best] = Array.from(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const mine = Array.from(open).filter((n) => owners[n].includes(best));
    byFriend.set(best, mine);
    for (const n of mine) open.delete(n);
  }
  return { byFriend, unassigned };
}
