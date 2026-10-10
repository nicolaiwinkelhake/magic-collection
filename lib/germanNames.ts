import { sleep } from "@/lib/scryfall";

// Deutsche Kartennamen über die Scryfall-Suche (lang:de) ermitteln.
// Mehrere Namen pro Anfrage per ODER-Verknüpfung exakter Namen; Scryfall
// liefert die deutschen Drucke mit `printed_name` (bzw. je Seite bei
// doppelseitigen Karten).
//
// Ergebnis je englischem Namen:
//   string  → deutscher Name
//   ""      → geprüft, es gibt keinen deutschen Druck (nicht erneut fragen)
// Fehlt ein Name in der Map, war Scryfall nicht erreichbar → später erneut.

const SCRYFALL_BASE = "https://api.scryfall.com";
export const NAMES_PER_QUERY = 20;

type SearchCard = {
  name: string;
  printed_name?: string;
  card_faces?: Array<{ name: string; printed_name?: string }>;
};

export function buildGermanQuery(names: string[]): string {
  const parts = names.map((n) => `!"${n.replace(/"/g, '\\"')}"`);
  return `lang:de (${parts.join(" or ")})`;
}

// Deutschen Namen aus einem Suchtreffer lesen – nur wenn der Treffer genau
// diese Karte ist (die Suche findet über `!"Name"` auch doppelseitige Karten,
// bei denen nur eine Seite so heißt).
export function germanNameFromCard(card: SearchCard): string | null {
  if (card.printed_name && card.printed_name !== card.name) return card.printed_name;
  if (card.card_faces?.length) {
    const faces = card.card_faces.map((f) => f.printed_name ?? f.name);
    const joined = faces.join(" // ");
    // Nur übernehmen, wenn wirklich übersetzt (manche Drucke haben nur
    // englische Seitennamen hinterlegt).
    if (card.card_faces.every((f) => f.printed_name) && joined !== card.name) return joined;
  }
  return null;
}

async function searchChunk(names: string[], unique: "cards" | "prints" = "cards"): Promise<SearchCard[] | null> {
  const params = new URLSearchParams({ q: buildGermanQuery(names), unique });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${SCRYFALL_BASE}/cards/search?${params}`, {
        headers: { "User-Agent": "MagicCollectionApp/1.0" },
      });
      if (res.status === 404) return []; // keine Treffer
      if (res.ok) return ((await res.json()).data ?? []) as SearchCard[];
    } catch {
      // Netzwerkfehler -> Retry
    }
    await sleep(800 * (attempt + 1));
  }
  return null;
}

export async function fetchGermanNames(englishNames: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const names = Array.from(new Set(englishNames.filter(Boolean)));
  await searchInto(names, "cards", result);

  // Doppelseitige Karten: der von Scryfall gewählte Druck hat oft keine
  // deutschen Seitennamen hinterlegt → gezielt über alle deutschen Drucke.
  const dfcMissing = names.filter((n) => n.includes(" // ") && result.get(n) === "");
  if (dfcMissing.length) {
    for (const n of dfcMissing) result.delete(n);
    await sleep(120);
    await searchInto(dfcMissing, "prints", result);
  }
  return result;
}

async function searchInto(names: string[], unique: "cards" | "prints", result: Map<string, string>) {
  for (let i = 0; i < names.length; i += NAMES_PER_QUERY) {
    const chunk = names.slice(i, i + NAMES_PER_QUERY);
    const cards = await searchChunk(chunk, unique);
    if (cards === null) continue; // nicht erreichbar: offen lassen
    const wanted = new Set(chunk);
    for (const card of cards) {
      if (!wanted.has(card.name) || result.get(card.name)) continue;
      const de = germanNameFromCard(card);
      if (de) result.set(card.name, de);
    }
    for (const n of chunk) if (!result.has(n)) result.set(n, "");
    if (i + NAMES_PER_QUERY < names.length) await sleep(120);
  }
}
