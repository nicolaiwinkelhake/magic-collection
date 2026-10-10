// Farbidentität in WUBRG-Reihenfolge (rein, getestet).

const ORDER = ["W", "U", "B", "R", "G"];

export function sortIdentity(colors: string[]): string[] {
  return Array.from(new Set(colors.map((c) => c.toUpperCase())))
    .filter((c) => ORDER.includes(c))
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

// Deck-Identität = Vereinigung aller Commander (Partner, Background).
export function unionIdentity(identities: string[][]): string[] {
  return sortIdentity(identities.flat());
}

// Liegt eine Karte innerhalb der Deck-Identität?
export function withinIdentity(cardIdentity: string[], deckIdentity: string[]): boolean {
  return cardIdentity.every((c) => deckIdentity.includes(c.toUpperCase()));
}
