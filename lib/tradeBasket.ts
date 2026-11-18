// Trade-Korb (rein, getestet): Karten, die man vom Freund haben möchte bzw.
// selbst dafür gibt. Mengen bleiben zwischen 1 und dem vorhandenen Bestand.

export type BasketCard = {
  id: string; // Sammlungseintrag (cards.id)
  name: string;
  image_url: string | null;
  foil: boolean;
  quantity: number; // Bestand des Besitzers
  price_eur: number | null;
  price_eur_foil: number | null;
  set_code?: string | null;
};

export type BasketItem = { card: BasketCard; qty: number };
export type Basket = BasketItem[];

const clamp = (n: number, max: number) => Math.max(1, Math.min(Math.floor(n) || 1, Math.max(1, max)));

/** Karten hinzufügen (schon vorhandene: +1, höchstens bis zum Bestand). */
export function addToBasket(basket: Basket, cards: BasketCard[]): Basket {
  const next = basket.map((b) => ({ ...b }));
  for (const card of cards) {
    const hit = next.find((b) => b.card.id === card.id);
    if (hit) hit.qty = clamp(hit.qty + 1, card.quantity);
    else next.push({ card, qty: 1 });
  }
  return next;
}

export function setBasketQty(basket: Basket, id: string, qty: number): Basket {
  if (qty <= 0) return basket.filter((b) => b.card.id !== id);
  return basket.map((b) => (b.card.id === id ? { ...b, qty: clamp(qty, b.card.quantity) } : b));
}

export function basketCount(basket: Basket): number {
  return basket.reduce((s, b) => s + b.qty, 0);
}

/** Marktwert (Foil-Preis bei Foil, sonst normal; fehlender Preis = 0). */
export function basketValue(basket: Basket): number {
  const v = basket.reduce((s, b) => s + ((b.card.foil ? b.card.price_eur_foil ?? b.card.price_eur : b.card.price_eur) ?? 0) * b.qty, 0);
  return Math.round(v * 100) / 100;
}

/** Für die API: nur ID + Menge. */
export function basketPayload(basket: Basket): Array<{ id: string; quantity: number }> {
  return basket.map((b) => ({ id: b.card.id, quantity: b.qty }));
}

// ---- Angefangene Trades merken ----
// Der Korb bleibt im Browser gespeichert (je Freund), damit er beim
// Seitenwechsel nicht verloren geht. Die Trades-Seite zeigt ihn als
// "angefangen" an, bis er abgeschickt oder verworfen wird.

export const DRAFTS_KEY = "trade-drafts";
export type TradeDraft = { name: string; basket: Basket; updated: string };
export type TradeDrafts = Record<string, TradeDraft>;

/** Korb für einen Freund setzen; leerer Korb entfernt den Entwurf. */
export function withDraft(drafts: TradeDrafts, ownerId: string, name: string, basket: Basket, now: string): TradeDrafts {
  const next = { ...drafts };
  if (basket.length) next[ownerId] = { name, basket, updated: now };
  else delete next[ownerId];
  return next;
}

export function parseDrafts(raw: string | null): TradeDrafts {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: TradeDrafts = {};
    for (const [id, d] of Object.entries(data as Record<string, TradeDraft>)) {
      if (d && Array.isArray(d.basket) && d.basket.length && typeof d.name === "string") out[id] = d;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadDrafts(): TradeDrafts {
  try {
    return parseDrafts(window.localStorage.getItem(DRAFTS_KEY));
  } catch {
    return {};
  }
}

export function saveDrafts(drafts: TradeDrafts): void {
  try {
    if (Object.keys(drafts).length) window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    else window.localStorage.removeItem(DRAFTS_KEY);
  } catch {
    // Speicher gesperrt – dann eben nur für diese Seite
  }
}
