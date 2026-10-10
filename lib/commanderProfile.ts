import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityFilter, scryfallSearch } from "@/lib/scryfallCache";

// Deckbau-Themen eines Commanders: Claude leitet aus dem Kartentext 3–6
// Themen ab, je Thema eine Scryfall-Suche (z. B. "otag:sacrifice-outlet").
// Ersetzt EDHRECs Themen-Seiten ohne deren Daten zu nutzen. Ergebnis wird
// global in commander_profiles gespeichert (Migration 010) – pro Commander
// entsteht also nur einmal ein API-Aufruf.

export const PROFILE_MODEL = "claude-opus-5-5";

export type CommanderTheme = { name: string; description: string; query: string };

export type CommanderInput = {
  name: string;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
};

const SCHEMA = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      description: "3 bis 6 Deckbau-Themen, wichtigstes zuerst.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Kurzer deutscher Themenname, z. B. „Aristokraten“, „Reanimator“, „+1/+1-Marken“." },
          description: {
            type: "string",
            description: "1–2 Sätze Deutsch: warum das Thema zum Commander passt und welche Karten gesucht sind.",
          },
          query: {
            type: "string",
            description:
              "Scryfall-Suchfragment OHNE Farbfilter und OHNE legal:, das typische Karten des Themas findet. Bevorzugt Tagger-Tags (otag:…), sonst o:/t:/kw:. Beispiele: \"otag:sacrifice-outlet\", \"(otag:reanimate or otag:self-mill)\", \"t:elf\", \"o:'+1/+1 counter'\".",
          },
        },
        required: ["name", "description", "query"],
        additionalProperties: false,
      },
    },
  },
  required: ["themes"],
  additionalProperties: false,
} as const;

function buildPrompt(cmd: CommanderInput): string {
  return [
    "Du bist ein erfahrener Commander-(EDH-)Deckbauer.",
    "Bestimme die wichtigsten Deckbau-Themen für diesen Commander – also wonach man beim Deckbau gezielt Karten sucht, um seine Fähigkeiten auszunutzen.",
    "Keine allgemeinen Kategorien wie Ramp, Removal oder Kartenziehen (die deckt die App separat ab).",
    "",
    `Name: ${cmd.name}`,
    `Typ: ${cmd.typeLine}`,
    `Farbidentität: ${cmd.colorIdentity.join("") || "farblos"}`,
    `Kartentext:\n${cmd.oracleText}`,
  ].join("\n");
}

// Ein Thema taugt nur, wenn seine Suche in den Commander-Farben genug
// Karten findet (schützt vor erfundenen Tags).
async function validTheme(theme: CommanderTheme, identity: string[]): Promise<boolean> {
  const hits = await scryfallSearch(`(${theme.query}) ${identityFilter(identity)} legal:commander`, { limit: 10 });
  return hits !== null && hits.length >= 5;
}

export async function generateThemes(cmd: CommanderInput): Promise<CommanderTheme[]> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: PROFILE_MODEL,
    max_tokens: 4000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    // Bei einer Sicherheitsablehnung automatisch auf ein anderes Modell ausweichen.
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    messages: [{ role: "user", content: buildPrompt(cmd) }],
  });

  if (response.stop_reason === "refusal") return [];
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return [];
  const parsed = JSON.parse(text.text) as { themes: CommanderTheme[] };

  const valid: CommanderTheme[] = [];
  for (const theme of parsed.themes.slice(0, 6)) {
    if (await validTheme(theme, cmd.colorIdentity)) valid.push(theme);
  }
  return valid;
}

// Gespeichertes Profil laden oder einmalig erzeugen.
export async function getCommanderThemes(supabase: SupabaseClient, cmd: CommanderInput): Promise<CommanderTheme[]> {
  const { data } = await supabase.from("commander_profiles").select("themes").eq("name", cmd.name).maybeSingle();
  if (data) return data.themes as CommanderTheme[];
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    const themes = await generateThemes(cmd);
    if (themes.length) {
      await supabase.rpc("save_commander_profile", { p_name: cmd.name, p_themes: themes, p_model: PROFILE_MODEL });
    }
    return themes;
  } catch (err) {
    console.error("Commander-Themen fehlgeschlagen", err);
    return [];
  }
}
