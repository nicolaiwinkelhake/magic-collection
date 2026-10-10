// Direktlinks zu EDHREC (keine Datennutzung – nur Verlinkung).
// EDHREC-Slugs: Kleinbuchstaben, Akzente entfernt, Apostrophe/Kommas weg,
// alles Übrige zu "-". Doppelseitige Karten nur mit der Vorderseite;
// Partner-Paare als "a-b" (alphabetisch sortiert).

export function edhrecSlug(name: string): string {
  return name
    .split(" // ")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’",.!?]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function commanderSlug(commander: string, partner?: string | null): string {
  if (!partner) return edhrecSlug(commander);
  return [edhrecSlug(commander), edhrecSlug(partner)].sort().join("-");
}

export function edhrecLinks(commander: string, partner?: string | null) {
  const slug = commanderSlug(commander, partner);
  return {
    commander: `https://edhrec.com/commanders/${slug}`,
    averageDeck: `https://edhrec.com/average-decks/${slug}`,
    combos: `https://edhrec.com/combos/${slug}`,
  };
}

export function edhrecCardLink(name: string): string {
  return `https://edhrec.com/cards/${edhrecSlug(name)}`;
}
