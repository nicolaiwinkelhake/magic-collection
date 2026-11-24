// Tägliche Mitteilungen (rein, ohne Server): neue Wunschlisten-Treffer bei
// Freunden und starke Preisbewegungen in der eigenen Sammlung.
import { cardValue } from "@/lib/valuation";
import type { PriceMover } from "@/lib/pushMessages";

export type WishMatch = { user_id: string; owner_id: string; owner_email: string; card_name: string };
export type WishSent = { user_id: string; owner_id: string; card_name: string };

const keyOf = (m: { user_id: string; owner_id: string; card_name: string }) => `${m.user_id}|${m.owner_id}|${m.card_name}`;

/** Neue Treffer (noch nicht gemeldet) je Nutzer, dazu was zu merken bzw. zu vergessen ist. */
export function diffWishlistMatches(matches: WishMatch[], sent: WishSent[]) {
  const sentKeys = new Set(sent.map(keyOf));
  const matchKeys = new Set(matches.map(keyOf));
  const fresh = matches.filter((m) => !sentKeys.has(keyOf(m)));
  const byUser = new Map<string, WishMatch[]>();
  for (const m of fresh) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m]);
  // nicht mehr vorhanden (verkauft, getauscht, Freigabe beendet) → vergessen,
  // damit ein erneutes Auftauchen wieder gemeldet wird
  const gone = sent.filter((s) => !matchKeys.has(keyOf(s)));
  return { byUser, remember: fresh.map(({ user_id, owner_id, card_name }) => ({ user_id, owner_id, card_name })), forget: gone };
}

export type OwnedCard = {
  user_id: string;
  scryfall_id: string | null;
  name: string;
  quantity: number;
  foil: boolean;
  condition?: string | null;
};
/** Preis je Druck an einem Tag: Normal und Foil */
export type DayPrices = Map<string, { eur: number | null; eurFoil: number | null }>;

/** Ab welcher Bewegung je Exemplar eine Karte als Ausreißer zählt */
export const MOVE_MIN_EUR = 2;
export const MOVE_MIN_PERCENT = 15;
/** Ab welcher Änderung der ganzen Sammlung an einem Tag gemeldet wird */
export const TOTAL_MIN_EUR = 5;
/** Kleinere Bewegungen werden in der Mitteilung nicht genannt */
const LIST_MIN_EUR = 0.1;

/**
 * Preisbewegung seit gestern je Nutzer: Gesamtänderung aller vergleichbaren
 * Karten und die größten Bewegungen (nach Betrag). Gemeldet wird (`alert`),
 * wenn eine Karte je Exemplar um ≥ 2 € und ≥ 15 % springt oder sich die
 * Sammlung insgesamt um ≥ 5 € bewegt. Zustand und Menge zählen wie beim
 * Sammlungswert.
 */
export function priceMovers(cards: OwnedCard[], today: DayPrices, yesterday: DayPrices) {
  const out = new Map<string, { total: number; movers: PriceMover[]; alert: boolean }>();
  // gleicher Druck (+ Foil) eines Nutzers zusammenfassen, z. B. mehrere Zustände
  const agg = new Map<string, { user: string; name: string; now: number; before: number; qty: number }>();
  for (const c of cards) {
    if (!c.scryfall_id || c.quantity <= 0) continue;
    const t = today.get(c.scryfall_id);
    const y = yesterday.get(c.scryfall_id);
    if (!t || !y) continue;
    const priced = (p: { eur: number | null; eurFoil: number | null }) => ({ ...c, quantity: 1, price_eur: p.eur, price_eur_foil: p.eurFoil });
    const nowOne = cardValue(priced(t));
    const beforeOne = cardValue(priced(y));
    if (!nowOne || !beforeOne) continue;
    const k = `${c.user_id}|${c.scryfall_id}|${c.foil ? 1 : 0}`;
    const a = agg.get(k) ?? { user: c.user_id, name: c.foil ? `${c.name} (Foil)` : c.name, now: 0, before: 0, qty: 0 };
    a.now += nowOne * c.quantity;
    a.before += beforeOne * c.quantity;
    a.qty += c.quantity;
    agg.set(k, a);
  }
  for (const a of agg.values()) {
    const u = out.get(a.user) ?? { total: 0, movers: [], alert: false };
    const delta = a.now - a.before;
    u.total += delta;
    const percent = (delta / a.before) * 100;
    if (Math.abs(delta / a.qty) >= MOVE_MIN_EUR && Math.abs(percent) >= MOVE_MIN_PERCENT) u.alert = true;
    if (Math.abs(delta) >= LIST_MIN_EUR) u.movers.push({ name: a.name, delta, percent });
    out.set(a.user, u);
  }
  for (const u of out.values()) {
    u.movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    if (Math.abs(u.total) >= TOTAL_MIN_EUR) u.alert = true;
  }
  return out;
}
