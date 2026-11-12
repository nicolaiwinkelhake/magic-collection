// Deck-Check (rein, getestet): Gesundheit eines Commander-Decks gegen das
// gängige Deckbau-Gerüst (Command-Zone-Template: ~37 Länder, 10+ Ramp,
// 10+ Kartenvorteil, 8+ Removal, 3 Board Wipes, Kurve mit Schwerpunkt
// 2–3 Mana) und konkrete Tauschvorschläge auf Basis der EDHREC-Statistik
// (Anteil der Decks + Synergie) – mit Quelle: eigene freie Karte, Freund
// oder kaufen.
import { ALL_ROLES, ROLE_LABEL, ROLE_TARGETS, isLand, type CardRole } from "@/lib/cardRoles";
import type { EdhrecCard } from "@/lib/edhrec";

export type DoctorDeckCard = { name: string; type_line: string | null; cmc: number | null; is_commander: boolean };

export type RoleCheck = { key: CardRole | "lands"; label: string; have: number; target: number; min: number; ok: boolean };

export type DeckHealth = {
  cards: number;
  lands: number;
  avgCmc: number;
  /** Nicht-Länder je Manawert 0,1,2,…,6,7+ */
  curve: number[];
  checks: RoleCheck[];
  /** 0–100 */
  score: number;
  /** kurze Hinweise, wichtigster zuerst */
  notes: string[];
  /** wie viele Karten ihre Rolle noch nicht kennen (Rollen werden nachgeladen) */
  unknownRoles: number;
};

const CHECKED: Array<CardRole | "lands"> = ["lands", "ramp", "draw", "removal", "wipe"];

export function deckHealth(cards: DoctorDeckCard[], roles: Map<string, CardRole[]>): DeckHealth {
  const main = cards.filter((c) => !c.is_commander);
  const lands = main.filter((c) => isLand(c));
  const spells = main.filter((c) => !isLand(c));
  const curve = Array.from({ length: 8 }, () => 0);
  let cmcSum = 0;
  for (const c of spells) {
    const v = Math.max(0, Math.round(c.cmc ?? 0));
    curve[Math.min(7, v)] += 1;
    cmcSum += c.cmc ?? 0;
  }
  const count: Record<string, number> = { lands: lands.length };
  for (const r of ALL_ROLES) count[r] = 0;
  let unknownRoles = 0;
  for (const c of spells) {
    const r = roles.get(c.name);
    if (!r) {
      unknownRoles += 1;
      continue;
    }
    for (const x of r) count[x] += 1;
  }
  const checks: RoleCheck[] = CHECKED.map((key) => {
    const t = ROLE_TARGETS[key]!;
    return {
      key,
      label: key === "lands" ? "Länder" : ROLE_LABEL[key],
      have: count[key] ?? 0,
      target: t.target,
      min: t.min,
      ok: key === "lands" ? count.lands >= t.min && count.lands <= 40 : (count[key] ?? 0) >= t.min,
    };
  });
  const avgCmc = spells.length ? Math.round((cmcSum / spells.length) * 100) / 100 : 0;

  // Punkte: Rollen (je Bereich anteilig erfüllt), Kurve, Länder
  let score = 0;
  for (const c of checks) {
    if (c.key === "lands") {
      const off = c.have < c.min ? c.min - c.have : c.have > 40 ? c.have - 40 : 0;
      score += Math.max(0, 20 - off * 5);
    } else {
      score += 20 * Math.min(1, c.have / c.target);
    }
  }
  const heavy = curve[6] + curve[7];
  if (avgCmc > 3.6) score -= Math.min(15, (avgCmc - 3.6) * 20);
  if (spells.length && heavy / spells.length > 0.2) score -= 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const notes: string[] = [];
  for (const c of checks) {
    if (c.ok) continue;
    if (c.key === "lands") notes.push(c.have < c.min ? `Nur ${c.have} Länder – Richtwert ${c.target}` : `${c.have} Länder sind viel – ${c.target} reichen meist`);
    else notes.push(`${c.label}: ${c.have} von ${c.target}`);
  }
  if (avgCmc > 3.6) notes.push(`Kurve hoch (Ø ${avgCmc.toFixed(2).replace(".", ",")} Mana)`);
  if (spells.length && heavy / spells.length > 0.2) notes.push(`${heavy} Karten mit 6+ Mana`);
  if (main.length < 99) notes.push(`${99 - main.length} Karten fehlen bis 99`);
  return { cards: main.length, lands: lands.length, avgCmc, curve, checks, score, notes, unknownRoles };
}

// ---------------------------------------------------------------------------
// Tauschvorschläge
// ---------------------------------------------------------------------------

export type FriendCopy = {
  ownerId: string;
  ownerName: string;
  card: { id: string; name: string; image_url: string | null; foil: boolean; quantity: number; price_eur: number | null; price_eur_foil: number | null; set_code: string | null };
};

export type Availability = {
  /** eigene Exemplare, die in keinem Deck stecken */
  free: number;
  /** eigene Exemplare insgesamt */
  owned: number;
  friends: FriendCopy[];
};

export type CandidateInfo = { typeLine: string; cmc: number; eur: number | null; image: string | null; identity: string[] };

export type Source = "collection" | "friend" | "buy";

export type SwapIn = {
  name: string;
  /** Wert fürs Deck (ohne Verfügbarkeit) */
  value: number;
  source: Source;
  eur: number | null;
  image: string | null;
  inclusion: number;
  synergy: number;
  roles: CardRole[];
  friend?: FriendCopy;
  reason: string;
  score: number;
};

export type SwapOut = { name: string; inclusion: number | null; roles: CardRole[]; cmc: number; reason: string; weakness: number };

export type Swap = { out: SwapOut; in: SwapIn };

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * Wert einer Karte für dieses Deck (höher = wichtiger): Anteil der Decks des
 * Commanders, die sie spielen, plus Synergie; Kernrolle leicht plus, sehr
 * teure Karten leicht minus. Nicht in der EDHREC-Liste = spielt kaum jemand.
 */
export function deckValue(card: { cmc: number | null }, edh: EdhrecCard | undefined, roles: CardRole[]): number {
  let v = edh ? edh.inclusion * 1.2 + Math.max(0, edh.synergy) * 0.8 : -0.1;
  if (roles.length) v += 0.1;
  if ((card.cmc ?? 0) >= 6) v -= 0.1;
  return Math.round(v * 1000) / 1000;
}

/** Wie entbehrlich ist eine Deckkarte? (höher = eher raus) */
export function weakness(card: DoctorDeckCard, edh: EdhrecCard | undefined, roles: CardRole[]): number {
  return -deckValue(card, edh, roles);
}

/** Mindestgewinn, damit ein Tausch vorgeschlagen wird */
const MIN_GAIN = 0.12;

function outReason(edh: EdhrecCard | undefined, roles: CardRole[], cmc: number): string {
  const parts: string[] = [];
  parts.push(edh ? `in ${pct(edh.inclusion)} der Decks` : "selten mit diesem Commander");
  if (!roles.length) parts.push("keine Kernrolle");
  if (cmc >= 6) parts.push(`${cmc} Mana`);
  return parts.join(" · ");
}

export function planSwaps(input: {
  deck: DoctorDeckCard[];
  identity: string[];
  commanderNames: string[];
  edhrec: EdhrecCard[];
  roles: Map<string, CardRole[]>;
  info: Map<string, CandidateInfo>;
  availability: Map<string, Availability>;
  health: DeckHealth;
  /** z. B. Karten in einem anderen Deck nicht doppelt vorschlagen */
  exclude?: Set<string>;
  limit?: number;
}): { swaps: Swap[]; adds: SwapIn[] } {
  const { deck, identity, edhrec, roles, info, availability, health } = input;
  const limit = input.limit ?? 8;
  const inDeck = new Set(deck.map((c) => c.name));
  const gaps = new Map(health.checks.filter((c) => c.key !== "lands" && c.have < c.target).map((c) => [c.key as CardRole, c.target - c.have]));

  // Kandidaten zum Reinnehmen
  const adds: SwapIn[] = [];
  for (const e of edhrec) {
    if (inDeck.has(e.name) || input.exclude?.has(e.name)) continue;
    const meta = info.get(e.name);
    if (!meta) continue;
    if (/\bLand\b/.test(meta.typeLine.split(" // ")[0]) && !/Creature/.test(meta.typeLine)) continue; // Länder separat
    if (!meta.identity.every((c) => identity.includes(c))) continue;
    const r = roles.get(e.name) ?? [];
    const av = availability.get(e.name) ?? { free: 0, owned: 0, friends: [] };
    const fills = r.filter((x) => gaps.has(x));
    const value = Math.round((e.inclusion * 1.2 + Math.max(0, e.synergy) * 0.8 + fills.length * 0.25) * 1000) / 1000;
    // Verfügbarkeit entscheidet nur bei ähnlich guten Karten
    let score = value;
    let source: Source = "buy";
    if (av.free > 0) {
      source = "collection";
      score += 0.12;
    } else if (av.friends.length) {
      source = "friend";
      score += 0.06;
    }
    const why: string[] = [`in ${pct(e.inclusion)} der Decks`];
    if (e.synergy >= 0.1) why.push(`Synergie +${Math.round(e.synergy * 100)} %`);
    if (fills.length) why.push(`${fills.map((f) => ROLE_LABEL[f]).join(", ")} fehlt`);
    adds.push({
      name: e.name,
      value,
      source,
      eur: meta.eur,
      image: meta.image,
      inclusion: e.inclusion,
      synergy: e.synergy,
      roles: r,
      friend: source === "friend" ? av.friends[0] : undefined,
      reason: why.join(" · "),
      score: Math.round(score * 1000) / 1000,
    });
  }
  adds.sort((a, b) => b.score - a.score);

  // Kandidaten zum Rausnehmen (keine Länder, nicht der Commander)
  const edhByName = new Map(edhrec.map((e) => [e.name, e]));
  const outs: SwapOut[] = deck
    .filter((c) => !c.is_commander && !isLand(c))
    .map((c) => {
      const r = roles.get(c.name) ?? [];
      const e = edhByName.get(c.name);
      return {
        name: c.name,
        inclusion: e ? e.inclusion : null,
        roles: r,
        cmc: c.cmc ?? 0,
        reason: outReason(e, r, c.cmc ?? 0),
        weakness: weakness(c, e, r),
      };
    })
    .sort((a, b) => b.weakness - a.weakness);

  // Paaren: stärkste Kandidaten gegen schwächste Karten. Füllt der Kandidat
  // eine fehlende Rolle, darf eine Karte ohne diese Rolle gehen; sonst
  // bevorzugt eine Karte derselben Rolle (gleichwertiger Ersatz).
  const swaps: Swap[] = [];
  const used = new Set<string>();
  for (const add of adds) {
    if (swaps.length >= limit) break;
    const pool = outs.filter((o) => !used.has(o.name));
    if (!pool.length) break;
    const fills = add.roles.some((r) => gaps.has(r));
    const sameRole = pool.find((o) => o.roles.some((r) => add.roles.includes(r)) && add.value + o.weakness >= MIN_GAIN);
    const out = fills ? pool[0] : sameRole ?? pool[0];
    // Nur tauschen, wenn die neue Karte fürs Deck klar mehr bringt
    if (add.value + out.weakness < MIN_GAIN) continue;
    used.add(out.name);
    swaps.push({ out, in: add });
  }
  return { swaps, adds: adds.slice(0, 40) };
}

/** Nutzt die Sammlung schon genug? – Kurzfazit für die Übersicht. */
export function healthLabel(score: number): { label: string; tone: "good" | "ok" | "bad" } {
  if (score >= 85) return { label: "Rund", tone: "good" };
  if (score >= 65) return { label: "Solide", tone: "ok" };
  return { label: "Baustelle", tone: "bad" };
}
