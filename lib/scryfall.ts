// Scryfall API – kostenlos, kein API-Key nötig.
// Rate Limit beachten: max ~10 req/s, daher kleine Pause zwischen Bulk-Importen.

export type ScryfallCard = {
  id: string;
  // gleiche Karte über alle Drucke hinweg (bei manchen Layouts nur in card_faces)
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  colors?: string[];
  // Farbidentität (inkl. Aktivierungs-/Kickerkosten) - relevant für Commander
  color_identity?: string[];
  // Farben, die die Karte als Mana erzeugen kann (Länder, Mana-Steine …)
  produced_mana?: string[];
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
    oracle_id?: string;
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
  // zuerst im eigenen Katalog (exakter Name, auch nur Vorderseite oder
  // deutsch) – gleicher Standarddruck wie Scryfalls Namenssuche
  const { catalogByNames } = await import("@/lib/catalogLookup");
  const local = (await catalogByNames([name]).catch(() => null))?.get(name.trim().toLowerCase());
  if (local) return { card: local, imageUrl: getImageUrl(local) };
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

// Scryfall erlaubt für /cards/collection nur etwa 2 Abfragen pro Sekunde.
// Schneller (früher 0,1 s Abstand) sperrt Scryfall nach ~25 Abfragen für
// 60 Sekunden (429 + Retry-After) – dann fehlten im nächtlichen Preis-Update
// ganze Blöcke. Großabrufe halten deshalb diesen Abstand ein.
export const COLLECTION_PACE_MS = 550;

/** Wartezeit nach einem 429: Retry-After (Sekunden), begrenzt auf 65 s. */
export function retryAfterMs(header: string | null, attempt: number): number {
  const sec = header ? Number(header) : NaN;
  if (Number.isFinite(sec) && sec >= 0) return Math.min(sec, 65) * 1000 + 250;
  return 2000 * (attempt + 1);
}

// /cards/collection (max. 75 Identifier) mit Retry: transiente Fehler
// (429/5xx/Netzwerk) ließen sonst einen ganzen Block als "nicht gefunden"
// durchfallen. Bei 429 wird so lange gewartet, wie Scryfall verlangt.
// null = Block auch nach Retries nicht abrufbar.
export async function fetchCollectionWithRetry(
  identifiers: Array<Record<string, string>>,
  attempts = 4
): Promise<ScryfallCard[] | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let wait = 800 * (attempt + 1);
    try {
      const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "MagicCollectionApp/1.0" },
        body: JSON.stringify({ identifiers }),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.data ?? []) as ScryfallCard[];
      }
      if (res.status === 429) wait = retryAfterMs(res.headers.get("retry-after"), attempt);
      else if (res.status >= 400 && res.status < 500) return null; // fehlerhafte Anfrage – Wiederholen hilft nicht
    } catch {
      // Netzwerkfehler -> Retry
    }
    if (attempt + 1 < attempts) await sleep(wait);
  }
  return null;
}

// Bulk-Import mehrerer Kartennamen (z. B. eine Zeile pro Karte aus einem Textfeld)
export async function fetchCardsByNames(names: string[]) {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  const results: Array<{
    name: string;
    card: ScryfallCard | null;
    imageUrl: string | null;
    error?: string;
  }> = [];

  // Scryfall /cards/collection erlaubt bis zu 75 Karten pro Request
  const CHUNK = 75;
  for (let i = 0; i < trimmed.length; i += CHUNK) {
    const chunk = trimmed.slice(i, i + CHUNK);
    const body = { identifiers: chunk.map((name) => ({ name })) };

    const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MagicCollectionApp/1.0",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Fallback: Einzelabfragen für diesen Chunk
      for (const name of chunk) {
        const result = await fetchCardByName(name);
        results.push({ name, ...result });
        await sleep(100);
      }
      continue;
    }

    const data = await res.json();
    const found: ScryfallCard[] = data.data ?? [];
    const notFound: Array<{ name: string }> = data.not_found ?? [];

    for (const card of found) {
      results.push({ name: card.name, card, imageUrl: getImageUrl(card) });
    }
    for (const nf of notFound) {
      results.push({ name: nf.name, card: null, imageUrl: null, error: `Karte "${nf.name}" nicht gefunden` });
    }

    if (i + CHUNK < trimmed.length) await sleep(100);
  }

  // Reihenfolge der Eingabe wiederherstellen
  const resultMap = new Map(results.map((r) => [r.name.toLowerCase(), r]));
  return trimmed.map((name) => resultMap.get(name.toLowerCase()) ?? { name, card: null, imageUrl: null });
}

export function getImageUrlPublic(card: ScryfallCard): string | null {
  return getImageUrl(card);
}

// Alle Sets von Scryfall (Code, Name, Kartenzahl) – für Set-Completion.
export type ScryfallSet = {
  code: string;
  name: string;
  card_count: number;
  released_at: string;
  set_type: string;
  icon_svg_uri: string | null;
  scryfall_uri: string | null;
  parent_set_code: string | null;
};

export async function fetchSets(): Promise<ScryfallSet[]> {
  const res = await fetch("https://api.scryfall.com/sets", {
    headers: { "User-Agent": "MagicCollectionApp/1.0" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.data as any[]) ?? []).map((s) => ({
    code: s.code,
    name: s.name,
    card_count: s.card_count,
    released_at: s.released_at ?? "",
    set_type: s.set_type ?? "",
    icon_svg_uri: s.icon_svg_uri ?? null,
    scryfall_uri: s.scryfall_uri ?? null,
    parent_set_code: s.parent_set_code ?? null,
  }));
}

// Gibt nur die Kartennamen zurück; passt in eine Suchseite (aktuell ~53 Karten).
export async function fetchGameChangerNames(): Promise<string[]> {
  const names: string[] = [];
  let url: string | null =
    "https://api.scryfall.com/cards/search?q=is%3Agamechanger&unique=cards";

  // Paginierung folgen, falls die Liste je größer als eine Seite wird
  while (url) {
    const res: Response = await fetch(url, {
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

  // In 75er-Blöcke aufteilen (API-Limit), im erlaubten Tempo und mit Retry
  for (let i = 0; i < identifiers.length; i += 75) {
    const chunk = identifiers.slice(i, i + 75) as Array<Record<string, string>>;
    for (const card of (await fetchCollectionWithRetry(chunk)) ?? []) byId.set(card.id, card);
    if (i + 75 < identifiers.length) await sleep(COLLECTION_PACE_MS);
  }

  return byId;
}
