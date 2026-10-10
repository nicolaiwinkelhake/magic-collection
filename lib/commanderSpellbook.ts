// Commander Spellbook – kostenlose, kuratierte Combo-Datenbank (kein API-Key nötig).
// https://backend.commanderspellbook.com/find-my-combos
// Liefert echte, verifizierte Combos statt Karten-Texte von der KI "erraten" zu lassen.

const API_URL = "https://backend.commanderspellbook.com/find-my-combos";
const MAX_MAIN_CARDS = 600;
const FETCH_TIMEOUT_MS = 12000;

export type Combo = {
  cards: string[];
  produces: string[];
  description: string;
  popularity: number;
};

export type AlmostCombo = Combo & {
  missing: string[];
};

export type ComboSearchResult = {
  included: Combo[];
  almostIncluded: AlmostCombo[];
};

type SpellbookVariant = {
  uses?: { card: { name: string } }[];
  produces?: { feature: { name: string } }[];
  description?: string;
  popularity?: number | null;
};

function toCombo(variant: SpellbookVariant): Combo {
  return {
    cards: (variant.uses ?? []).map((u) => u.card.name),
    produces: (variant.produces ?? []).map((p) => p.feature.name),
    description: variant.description ?? "",
    popularity: variant.popularity ?? 0,
  };
}

export async function findCombos(
  mainCardNames: string[],
  commanderNames: string[]
): Promise<ComboSearchResult | null> {
  const main = Array.from(new Set(mainCardNames)).slice(0, MAX_MAIN_CARDS);
  if (main.length === 0) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        main: main.map((card) => ({ card, quantity: 1 })),
        commanders: commanderNames.map((card) => ({ card, quantity: 1 })),
      }),
      // Externe API kann langsam/nicht erreichbar sein - darf die ganze Route nicht blockieren.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results;
    if (!results) return null;

    const owned = new Set([...main, ...commanderNames].map((n) => n.toLowerCase()));

    const included: Combo[] = (results.included ?? [])
      .map(toCombo)
      .sort((a: Combo, b: Combo) => b.popularity - a.popularity);

    const almostIncluded: AlmostCombo[] = (results.almostIncluded ?? [])
      .map((variant: SpellbookVariant) => {
        const combo = toCombo(variant);
        const missing = combo.cards.filter((c) => !owned.has(c.toLowerCase()));
        return { ...combo, missing };
      })
      .filter((c: AlmostCombo) => c.missing.length > 0 && c.missing.length <= 2)
      .sort((a: AlmostCombo, b: AlmostCombo) => b.popularity - a.popularity);

    return { included, almostIncluded };
  } catch {
    return null;
  }
}

// Combos, an denen eine bestimmte Karte (z. B. der Commander) beteiligt ist,
// nach Beliebtheit. Link: https://commanderspellbook.com/combo/<id>/
export type CardCombo = Combo & { id: string; bracketTag: string | null };

export async function findCombosWithCard(cardName: string, limit = 12): Promise<CardCombo[]> {
  const params = new URLSearchParams({
    q: `card:"${cardName.replace(/"/g, "")}"`,
    ordering: "-popularity",
    limit: String(limit),
  });
  try {
    const res = await fetch(`https://backend.commanderspellbook.com/variants/?${params}`, {
      headers: { "User-Agent": "MagicCollectionApp/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data?.results ?? []) as Array<SpellbookVariant & { id: string; bracketTag?: string | null }>).map((v) => ({
      ...toCombo(v),
      id: v.id,
      bracketTag: v.bracketTag ?? null,
    }));
  } catch {
    return [];
  }
}
