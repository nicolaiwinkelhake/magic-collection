// Baut Scryfall-Suchqueries für Deck-Vorschläge – rein funktional und damit
// gut testbar. Nutzt Scryfalls Oracle-Tags (otag:) für hohe Trefferqualität
// und schränkt auf die Farbidentität des Commanders + Commander-Legalität ein.

export type SuggestionCategory = "ramp" | "removal" | "draw" | "wipe";

const OTAG: Record<SuggestionCategory, string> = {
  ramp: "ramp",
  removal: "removal",
  draw: "card-advantage",
  wipe: "board-wipe",
};

export const CATEGORY_LABEL: Record<SuggestionCategory, string> = {
  ramp: "Ramp",
  removal: "Removal",
  draw: "Kartenziehen",
  wipe: "Board Wipe",
};

// Farbidentität als Scryfall-Kürzel: ["W","U","B"] -> "wub", leer -> "c".
export function colorIdentityToken(colorIdentity: string[]): string {
  if (!colorIdentity || colorIdentity.length === 0) return "c";
  const order = ["W", "U", "B", "R", "G"];
  return order
    .filter((c) => colorIdentity.includes(c))
    .join("")
    .toLowerCase();
}

export function buildSuggestionQuery(
  category: SuggestionCategory,
  colorIdentity: string[]
): string {
  const id = colorIdentityToken(colorIdentity);
  // id<= : Karten, deren Farbidentität in der des Commanders enthalten ist
  return `otag:${OTAG[category]} id<=${id} legal:commander -is:funny`;
}

// Vollständige Such-URL inkl. Sortierung nach Popularität (edhrec) und
// eindeutigen Karten.
export function buildSuggestionUrl(
  category: SuggestionCategory,
  colorIdentity: string[]
): string {
  const q = buildSuggestionQuery(category, colorIdentity);
  const params = new URLSearchParams({
    q,
    order: "edhrec",
    unique: "cards",
    dir: "asc",
  });
  return `https://api.scryfall.com/cards/search?${params.toString()}`;
}
