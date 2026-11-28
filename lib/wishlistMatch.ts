// Gleiche Karte unabhängig von Version/Druck: Vergleich über den Namen
// (Groß-/Kleinschreibung egal, bei doppelseitigen Karten zählt auch die Vorderseite).

export function cardKey(name: string): string {
  return name.split(" // ")[0].trim().toLowerCase();
}

/** Wunschlisten-Einträge, deren Karte (egal welche Version) unter `addedNames` ist. */
export function wishlistMatches<T extends { name: string }>(wishlist: T[], addedNames: string[]): T[] {
  const keys = new Set(addedNames.map(cardKey));
  return wishlist.filter((w) => keys.has(cardKey(w.name)));
}
