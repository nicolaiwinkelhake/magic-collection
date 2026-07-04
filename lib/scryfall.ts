// Scryfall API – kostenlos, kein API-Key nötig.
// Rate Limit beachten: max ~10 req/s, daher kleine Pause zwischen Bulk-Importen.

export type ScryfallCard = {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  colors?: string[];
  rarity: string;
  oracle_text?: string;
  // Cardmarket-Preise (in EUR) – von Scryfall mitgeliefert, kein eigener Cardmarket-Zugang nötig
  prices?: {
    eur?: string | null;
    eur_foil?: string | null;
    usd?: string | null;
  };
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    png: string;
  };
  // Bei doppelseitigen Karten (Modal DFC) liegen Bilder pro Seite vor
  card_faces?: Array<{
    image_uris?: { small: string; normal: string; large: string; png: string };
  }>;
};

export function getPrices(card: ScryfallCard): {
  eur: number | null;
  eurFoil: number | null;
} {
  const eur = card.prices?.eur ? parseFloat(card.prices.eur) : null;
  const eurFoil = card.prices?.eur_foil
    ? parseFloat(card.prices.eur_foil)
    : null;
  return { eur, eurFoil };
}

const SCRYFALL_BASE = "https://api.scryfall.com";

function getImageUrl(card: ScryfallCard): string | null {
  if (card.image_uris) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris) {
    return card.card_faces[0].image_uris.normal;
  }
  return null;
}

// Exakte Suche nach Kartennamen (für den Import gedacht)
export async function fetchCardByName(name: string): Promise<{
  card: ScryfallCard | null;
  imageUrl: string | null;
  error?: string;
}> {
  const url = `${SCRYFALL_BASE}/cards/named?fuzzy=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "MagicCollectionApp/1.0" },
  });

  if (!res.ok) {
    return { card: null, imageUrl: null, error: `Karte "${name}" nicht gefunden` };
  }

  const card: ScryfallCard = await res.json();
  return { card, imageUrl: getImageUrl(card) };
}

// Hilfsfunktion: kleine Pause zwischen Requests, um Scryfall-Rate-Limit einzuhalten
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bulk-Import mehrerer Kartennamen (z. B. eine Zeile pro Karte aus einem Textfeld)
export async function fetchCardsByNames(names: string[]) {
  const results: Array<{
    name: string;
    card: ScryfallCard | null;
    imageUrl: string | null;
    error?: string;
  }> = [];

  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const result = await fetchCardByName(trimmed);
    results.push({ name: trimmed, ...result });
    await sleep(100); // Scryfall-freundliches Tempo
  }

  return results;
}

export function getImageUrlPublic(card: ScryfallCard): string | null {
  return getImageUrl(card);
}

// Alle Sets von Scryfall (Code, Name, Kartenzahl) – für Set-Completion.
export async function fetchSets(): Promise<
  Array<{ code: string; name: string; card_count: number; released_at: string }>
> {
  const res = await fetch("https://api.scryfall.com/sets", {
    headers: { "User-Agent": "MagicCollectionApp/1.0" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.data as any[]) ?? []).map((s) => ({
    code: s.code,
    name: s.name,
    card_count: s.card_count,
    released_at: s.released_at ?? "",
  }));
}
// Gibt nur die Kartennamen zurück; passt in eine Suchseite (aktuell ~53 Karten).
export async function fetchGameChangerNames(): Promise<string[]> {
  const names: string[] = [];
  let url: string | null =
    "https://api.scryfall.com/cards/search?q=is%3Agamechanger&unique=cards";

  // Paginierung folgen, falls die Liste je größer als eine Seite wird
  while (url) {
    const res = await fetch(url, {
      headers: { "User-Agent": "MagicCollectionApp/1.0" },
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const card of (data.data as ScryfallCard[]) ?? []) {
      names.push(card.name);
    }
    url = data.has_more ? data.next_page : null;
    if (url) await sleep(100);
  }

  return names;
}

// Kartenvorschläge über die Scryfall-Suche abrufen. Bekommt eine fertige
// Such-URL (siehe lib/scryfallSearch) und gibt eine kompakte Trefferliste
// zurück, ohne bereits im Deck vorhandene Karten.
export async function fetchSuggestions(
  url: string,
  excludeNames: string[],
  limit = 6
): Promise<
  Array<{ id: string; name: string; imageUrl: string | null; eur: number | null }>
> {
  const res = await fetch(url, {
    headers: { "User-Agent": "MagicCollectionApp/1.0" },
  });
  if (!res.ok) return [];

  const data = await res.json();
  const exclude = new Set(excludeNames.map((n) => n.toLowerCase()));
  const out: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    eur: number | null;
  }> = [];

  for (const card of (data.data as ScryfallCard[]) ?? []) {
    if (exclude.has(card.name.toLowerCase())) continue;
    const { eur } = getPrices(card);
    out.push({ id: card.id, name: card.name, imageUrl: getImageUrl(card), eur });
    if (out.length >= limit) break;
  }
  return out;
}

// Batch-Abruf über Scryfalls /cards/collection-Endpoint: bis zu 75 Karten
// pro Request. Deutlich schneller und schonender als Einzelabfragen –
// ideal für Preis-Updates über eine ganze Sammlung.
// Identifier können { id } (Scryfall-ID) oder { name } sein.
export async function fetchCardsCollection(
  identifiers: Array<{ id: string } | { name: string }>
): Promise<Map<string, ScryfallCard>> {
  const byId = new Map<string, ScryfallCard>();

  // In 75er-Blöcke aufteilen (API-Limit)
  for (let i = 0; i < identifiers.length; i += 75) {
    const chunk = identifiers.slice(i, i + 75);
    const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MagicCollectionApp/1.0",
      },
      body: JSON.stringify({ identifiers: chunk }),
    });

    if (res.ok) {
      const data = await res.json();
      for (const card of data.data as ScryfallCard[]) {
        byId.set(card.id, card);
      }
    }

    if (i + 75 < identifiers.length) await sleep(100);
  }

  return byId;
}
