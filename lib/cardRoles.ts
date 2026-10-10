import { sleep } from "@/lib/scryfall";

// Kartenrollen aus Scryfalls Community-Tags ("otag:", Tagger-Projekt) statt
// eigener Regex-Heuristik. Die Tags sind von Hand gepflegt und erkennen z. B.
// Mana-Steine ohne "add {X}" im Text oder "draw X cards" zuverlässig.
//
// Abfrage gebündelt: je Rolle eine Suche über bis zu NAMES_PER_QUERY exakte
// Namen ("(!"A" or !"B") otag:ramp"). Ergebnisse werden global in der Tabelle
// card_roles zwischengespeichert, jede Karte wird also nur einmal abgefragt.

export type CardRole =
  | "ramp"
  | "draw"
  | "removal"
  | "wipe"
  | "tutor"
  | "counter"
  | "protection"
  | "recursion";

export const ROLE_TAGS: Record<CardRole, string> = {
  ramp: "otag:ramp",
  draw: "otag:card-advantage",
  removal: "otag:removal",
  wipe: "otag:board-wipe",
  tutor: "otag:tutor",
  counter: "otag:counterspell",
  protection: "otag:protection",
  recursion: "otag:recursion",
};

export const ROLE_LABEL: Record<CardRole, string> = {
  ramp: "Ramp",
  draw: "Kartenvorteil",
  removal: "Removal",
  wipe: "Board Wipe",
  tutor: "Tutor",
  counter: "Counterspell",
  protection: "Schutz",
  recursion: "Rekursion",
};

export const ALL_ROLES = Object.keys(ROLE_TAGS) as CardRole[];

const SCRYFALL_BASE = "https://api.scryfall.com";
export const NAMES_PER_QUERY = 20;

export function buildRoleQuery(names: string[], role: CardRole): string {
  const parts = names.map((n) => `!"${n.replace(/"/g, '\\"')}"`);
  return `(${parts.join(" or ")}) ${ROLE_TAGS[role]}`;
}

// Alle Treffer-Namen einer Suche (inkl. Folgeseiten). null = nicht erreichbar.
async function searchNames(query: string): Promise<string[] | null> {
  const names: string[] = [];
  let url: string | null = `${SCRYFALL_BASE}/cards/search?${new URLSearchParams({ q: query, unique: "cards" })}`;
  while (url) {
    let page: { data?: Array<{ name: string }>; has_more?: boolean; next_page?: string } | null = null;
    for (let attempt = 0; attempt < 3 && !page; attempt++) {
      try {
        const res: Response = await fetch(url, { headers: { "User-Agent": "MagicCollectionApp/1.0" } });
        if (res.status === 404) return names; // keine Treffer
        if (res.ok) page = await res.json();
      } catch {
        // Netzwerkfehler -> Retry
      }
      if (!page) await sleep(800 * (attempt + 1));
    }
    if (!page) return null;
    names.push(...(page.data ?? []).map((c) => c.name));
    url = page.has_more && page.next_page ? page.next_page : null;
    if (url) await sleep(100);
  }
  return names;
}

// Ermittelt die Rollen für die übergebenen (englischen) Kartennamen.
// Namen, deren Abfrage scheiterte, fehlen im Ergebnis (später erneut).
export async function fetchCardRoles(cardNames: string[]): Promise<Map<string, CardRole[]>> {
  const names = Array.from(new Set(cardNames.filter(Boolean)));
  const result = new Map<string, CardRole[]>();
  for (let i = 0; i < names.length; i += NAMES_PER_QUERY) {
    const chunk = names.slice(i, i + NAMES_PER_QUERY);
    const roles = new Map<string, CardRole[]>(chunk.map((n) => [n, []]));
    let failed = false;
    for (const role of ALL_ROLES) {
      const hits = await searchNames(buildRoleQuery(chunk, role));
      if (hits === null) {
        failed = true;
        break;
      }
      for (const name of hits) roles.get(name)?.push(role);
      await sleep(100);
    }
    if (!failed) for (const [name, r] of roles) result.set(name, r);
  }
  return result;
}

// --- Auswertung (rein, getestet) ---------------------------------------

export type RoleCard = { name: string; type_line: string | null; is_commander: boolean };

// Richtwerte für ein 100-Karten-Commander-Deck (an gängige Deckbau-Templates
// angelehnt). min = Untergrenze für eine Warnung, target = Zielwert.
export const ROLE_TARGETS: Partial<Record<CardRole | "lands", { min: number; target: number }>> = {
  lands: { min: 34, target: 37 },
  ramp: { min: 8, target: 10 },
  draw: { min: 8, target: 10 },
  removal: { min: 6, target: 8 },
  wipe: { min: 1, target: 3 },
};

export function isLand(card: { type_line: string | null }): boolean {
  // Rückseiten zählen nicht: "Instant // Land" (MDFC) bleibt ein Zauber.
  const front = (card.type_line ?? "").split(" // ")[0].toLowerCase();
  return front.includes("land");
}

// Zählt Karten je Rolle (eine Karte kann mehrere Rollen haben).
export function countRoles<T extends RoleCard>(
  cards: T[],
  rolesByName: Map<string, CardRole[]>
): { lands: T[]; byRole: Record<CardRole, T[]>; unknown: T[] } {
  const byRole = Object.fromEntries(ALL_ROLES.map((r) => [r, [] as T[]])) as Record<CardRole, T[]>;
  const lands: T[] = [];
  const unknown: T[] = [];
  for (const card of cards) {
    if (card.is_commander) continue;
    if (isLand(card)) {
      lands.push(card);
      continue;
    }
    const roles = rolesByName.get(card.name);
    if (!roles) {
      unknown.push(card);
      continue;
    }
    for (const r of roles) byRole[r].push(card);
  }
  return { lands, byRole, unknown };
}
