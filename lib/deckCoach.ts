import Anthropic from "@anthropic-ai/sdk";
import type { CardRole } from "@/lib/cardRoles";

// Deck-Coach: Claude schlägt konkrete Tausche vor ("raus X → rein Y"), aber
// nur aus einer vorgegebenen Kandidatenliste (Scryfall-Listen der
// Commander-Seite, gefiltert nach Modus/Budget/Bracket). Die Antwort wird
// gegen Deck und Kandidaten geprüft (validateCoach, rein + getestet).

export const COACH_MODEL = "claude-opus-5-5";

export type CoachMode = "collection" | "budget" | "best";

export type CoachDeckCard = { name: string; typeLine: string; cmc: number; roles: CardRole[] | null };
export type CoachCandidate = {
  name: string;
  typeLine: string;
  cmc: number;
  eur: number | null;
  owned: number;
  gameChanger: boolean;
  lists: string[]; // in welchen Listen (Thema, Ramp …) die Karte vorkommt
};

export type CoachSwap = { out: string; in: string; reason: string };
export type CoachResult = { summary: string; swaps: CoachSwap[]; cuts: Array<{ name: string; reason: string }> };

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "2–4 Sätze Deutsch: größte Schwächen des Decks und Richtung der Änderungen." },
    swaps: {
      type: "array",
      description: "Bis zu 10 Tausche, wichtigster zuerst.",
      items: {
        type: "object",
        properties: {
          out: { type: "string", description: "Exakter Name einer Karte aus dem Deck (nicht der Commander)." },
          in: { type: "string", description: "Exakter Name einer Karte aus der Kandidatenliste." },
          reason: { type: "string", description: "1 Satz Deutsch: warum der Tausch das Deck verbessert." },
        },
        required: ["out", "in", "reason"],
        additionalProperties: false,
      },
    },
    cuts: {
      type: "array",
      description: "Bis zu 5 weitere schwache Karten des Decks (Streichkandidaten ohne direkten Ersatz).",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          reason: { type: "string", description: "1 Satz Deutsch." },
        },
        required: ["name", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "swaps", "cuts"],
  additionalProperties: false,
} as const;

export function buildCoachPrompt(input: {
  commander: string;
  commanderText: string;
  themes: string[];
  deck: CoachDeckCard[];
  roleSummary: string;
  candidates: CoachCandidate[];
  mode: CoachMode;
  budget: number | null;
  targetBracket: number | null;
}): string {
  const modeText =
    input.mode === "collection"
      ? "Nur Karten aus der Sammlung des Spielers (alle Kandidaten sind schon im Besitz)."
      : input.mode === "budget"
      ? `Budget-Upgrade: neue Karten höchstens ${input.budget ?? 0} € je Karte (bereits besessene Kandidaten sind gratis).`
      : "Beste Upgrades ohne Budgetgrenze; bereits besessene Kandidaten bevorzugen, wenn sie ähnlich gut sind.";
  return [
    "Du bist ein erfahrener Commander-(EDH-)Deckbauer und coachst einen Spieler beim Verbessern seines Decks.",
    `Commander: ${input.commander}\n${input.commanderText}`,
    input.themes.length ? `Themen des Commanders: ${input.themes.join(", ")}` : "",
    `Rollenbilanz (Ist / Richtwert): ${input.roleSummary}`,
    `Modus: ${modeText}`,
    input.targetBracket ? `Ziel-Bracket: ${input.targetBracket} (keine Game Changer in Bracket 1–2).` : "",
    "",
    "Schlage Tausche vor, die Schwächen der Rollenbilanz beheben und die Synergie mit dem Commander erhöhen.",
    "Nimm schwache, unpassende oder zu teure (hoher Manawert ohne Wirkung) Karten heraus. Keine Länder gegen Zauber tauschen, wenn die Länderzahl knapp ist.",
    "Verwende AUSSCHLIESSLICH exakte Namen aus den Listen unten.",
    "",
    "DECK (Name | Typ | Manawert | Rollen):",
    ...input.deck.map((c) => `- ${c.name} | ${c.typeLine} | ${c.cmc} | ${c.roles?.join(",") || "-"}`),
    "",
    "KANDIDATEN (Name | Typ | Manawert | Preis € | besessen | Listen):",
    ...input.candidates.map(
      (c) =>
        `- ${c.name} | ${c.typeLine} | ${c.cmc} | ${c.eur ?? "?"} | ${c.owned > 0 ? "ja" : "nein"}${c.gameChanger ? " | Game Changer" : ""} | ${c.lists.join(", ")}`
    ),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

// Prüft die Claude-Antwort: nur echte Deckkarten raus, nur Kandidaten rein,
// keine Dubletten. Ungültige Einträge werden verworfen.
export function validateCoach(
  raw: CoachResult,
  deckNames: string[],
  commanderNames: string[],
  candidateNames: string[]
): CoachResult {
  const deck = new Set(deckNames.filter((n) => !commanderNames.includes(n)));
  const candidates = new Set(candidateNames.filter((n) => !deckNames.includes(n)));
  const usedOut = new Set<string>();
  const usedIn = new Set<string>();
  const swaps = raw.swaps.filter((s) => {
    if (!deck.has(s.out) || !candidates.has(s.in) || usedOut.has(s.out) || usedIn.has(s.in)) return false;
    usedOut.add(s.out);
    usedIn.add(s.in);
    return true;
  });
  const cuts = raw.cuts.filter((c) => deck.has(c.name) && !usedOut.has(c.name));
  return { summary: raw.summary, swaps: swaps.slice(0, 10), cuts: cuts.slice(0, 5) };
}

export async function runCoach(prompt: string): Promise<CoachResult | null> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: COACH_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    // Bei einer Sicherheitsablehnung automatisch auf ein anderes Modell ausweichen.
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  return JSON.parse(text.text) as CoachResult;
}

// Verständliche Meldung für typische API-Fehler (Guthaben, Schlüssel, Last).
export function coachErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Der Anthropic-API-Schlüssel ist ungültig. Bitte in Vercel prüfen.";
  }
  if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) {
    return "Das Guthaben des Anthropic-Kontos ist aufgebraucht. Bitte unter console.anthropic.com → Plans & Billing aufladen.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Zu viele Anfragen an Claude gerade. Bitte in einer Minute erneut versuchen.";
  }
  return "Der Coach ist gerade nicht erreichbar. Bitte später erneut versuchen.";
}
