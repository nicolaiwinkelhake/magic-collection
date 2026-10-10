import type { CommanderTheme } from "@/lib/commanderProfile";
import type { CompactCard } from "@/lib/scryfallCache";
import { identityFilter } from "@/lib/scryfallCache";

// Kartenlisten der Commander-Seite (rein, getestet). Aufbau wie bei EDHREC:
// neue Karten, Themen-Synergie, Top-Karten, Rollen, Länder – aber aus
// Scryfall-Daten und mit Bezug zur eigenen Sammlung.

export type ListSpec = {
  key: string;
  label: string;
  description?: string;
  query: string;
  order: string;
  limit: number;
  ttlDays: number;
};

const NEW_CARD_DAYS = 120;

export function buildListSpecs(identity: string[], themes: CommanderTheme[], today = new Date()): ListSpec[] {
  const id = `${identityFilter(identity)} legal:commander`;
  const since = new Date(today.getTime() - NEW_CARD_DAYS * 86400_000).toISOString().slice(0, 10);
  return [
    {
      key: "new",
      label: "Neue Karten",
      description: `Erschienen seit ${since.split("-").reverse().join(".")}`,
      query: `${id} date>=${since} -t:basic not:reprint`,
      order: "edhrec",
      limit: 18,
      ttlDays: 1,
    },
    ...themes.map((t, i) => ({
      key: `theme-${i}`,
      label: t.name,
      description: t.description,
      query: `(${t.query}) ${id}`,
      order: "edhrec",
      limit: 24,
      ttlDays: 14,
    })),
    { key: "top", label: "Top-Karten in deinen Farben", query: `${id} -t:land`, order: "edhrec", limit: 30, ttlDays: 7 },
    { key: "ramp", label: "Ramp", query: `otag:ramp -t:land ${id}`, order: "edhrec", limit: 18, ttlDays: 7 },
    { key: "draw", label: "Kartenvorteil", query: `otag:card-advantage ${id}`, order: "edhrec", limit: 18, ttlDays: 7 },
    { key: "removal", label: "Removal", query: `otag:removal -otag:board-wipe ${id}`, order: "edhrec", limit: 18, ttlDays: 7 },
    { key: "wipe", label: "Board Wipes", query: `otag:board-wipe ${id}`, order: "edhrec", limit: 12, ttlDays: 7 },
    { key: "lands", label: "Länder", query: `t:land -t:basic ${id}`, order: "edhrec", limit: 24, ttlDays: 7 },
  ];
}

export type CardMarks = {
  owned: number;
  inDecks: string[];
  friends: Array<{ friendEmail: string; quantity: number }>;
  groupDecks: number;
};

export type ListCard = CompactCard & CardMarks;

export type ListFilters = {
  maxPrice: number | null; // € je Karte
  noGameChangers: boolean; // für Brackets 1–2
  ownership: "all" | "owned" | "missing";
};

export function filterCards(cards: ListCard[], f: ListFilters): ListCard[] {
  return cards.filter((c) => {
    if (f.ownership === "owned" && c.owned === 0) return false;
    if (f.ownership === "missing" && c.owned > 0) return false;
    if (f.noGameChangers && c.gameChanger) return false;
    // Besessene Karten kosten nichts – Budget gilt nur für fehlende.
    if (f.maxPrice !== null && c.owned === 0 && (c.eur ?? 0) > f.maxPrice) return false;
    return true;
  });
}

// Karten aus Listen entfernen, die der Commander selbst sind, und Dubletten
// innerhalb einer Liste vermeiden.
export function cleanList(cards: CompactCard[], commanderNames: string[]): CompactCard[] {
  const skip = new Set(commanderNames);
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (skip.has(c.name) || seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}
