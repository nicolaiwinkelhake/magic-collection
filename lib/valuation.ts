// Zustandsabhängige Bewertung. Der Marktpreis (Scryfall/Cardmarket) bezieht
// sich auf NM; gespielte Karten sind weniger wert. Faktoren sind Richtwerte
// und bewusst konservativ – rein funktional und testbar.

export const CONDITION_FACTOR: Record<string, number> = {
  NM: 1.0, // Near Mint
  LP: 0.9, // Lightly Played
  MP: 0.75, // Moderately Played
  HP: 0.6, // Heavily Played
  DMG: 0.4, // Damaged
};

export type ValuableCard = {
  quantity: number;
  foil: boolean;
  price_eur: number | null;
  price_eur_foil: number | null;
  condition?: string | null;
};

// Basispreis einer Karte (Foil-abhängig), ohne Menge/Zustand.
export function basePrice(card: ValuableCard): number {
  const p = card.foil ? card.price_eur_foil ?? card.price_eur : card.price_eur;
  return p ?? 0;
}

// Zustandsfaktor (Standard NM = 1.0, unbekannt behandelt wie NM).
export function conditionFactor(condition?: string | null): number {
  if (!condition) return 1;
  return CONDITION_FACTOR[condition] ?? 1;
}

// Wert einer einzelnen Karte inkl. Menge und Zustand.
export function cardValue(card: ValuableCard): number {
  const raw = basePrice(card) * conditionFactor(card.condition) * card.quantity;
  return Math.round(raw * 100) / 100;
}

// Gesamtwert einer Kartenliste.
export function totalValue(cards: ValuableCard[]): number {
  const sum = cards.reduce((acc, c) => acc + cardValue(c), 0);
  return Math.round(sum * 100) / 100;
}
