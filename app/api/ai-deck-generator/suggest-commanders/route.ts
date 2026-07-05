import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { findCombos } from "@/lib/commanderSpellbook";

// Adaptive Thinking + Sammlungs-/Combo-Analyse brauchen mehr Zeit als der Standard-Timeout.
export const maxDuration = 120;

const MAX_POOL_OVERVIEW = 800;
const MAX_COMBO_LINES = 40;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Antwort ist NDJSON (ein JSON-Objekt pro Zeile): "status"-Events zeigen dem
// Nutzer live, in welcher Phase die Analyse gerade steckt, statt dass der
// Button minutenlang ohne jedes Feedback haengt.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ error: "Nicht angemeldet" }, 401);

  const { data: cards } = await supabase
    .from("cards")
    .select("name, image_url, type_line, cmc, colors, oracle_text")
    .eq("user_id", user.id);

  if (!cards || cards.length === 0) {
    return jsonResponse({ error: "Deine Sammlung ist leer." }, 400);
  }

  const candidates = cards.filter(
    (c) => /Legendary/.test(c.type_line ?? "") && /Creature|Planeswalker/.test(c.type_line ?? "")
  );
  if (candidates.length === 0) {
    return jsonResponse({ error: "Keine legendäre Kreatur oder Planeswalker in deiner Sammlung gefunden." }, 400);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      send({ type: "status", message: `Analysiere ${cards.length} Karten aus deiner Sammlung...` });

      // Echte, verifizierte Combos suchen, die sich schon rein aus der Sammlung bauen lassen
      // (unabhängig vom Commander) - Grundlage dafür, welche Farbidentitäten sich lohnen.
      const BASIC_LANDS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
      const nonBasicLandNames = Array.from(
        new Set(cards.filter((c) => !BASIC_LANDS.has(c.name.toLowerCase())).map((c) => c.name))
      );

      send({ type: "status", message: "Suche verifizierte Combos in deiner Sammlung..." });
      const comboResult = await findCombos(nonBasicLandNames, []);
      const comboSummary = (comboResult?.included ?? [])
        .slice(0, MAX_COMBO_LINES)
        .map((c) => `${c.cards.join(" + ")} => ${c.produces.join(", ")}`)
        .join("\n");

      const candidateList = candidates
        .map((c) => {
          const colors = (c.colors ?? []).join("") || "C";
          const text = (c.oracle_text ?? "").replace(/\n/g, " ");
          return `${c.name} | ${colors} | ${text}`;
        })
        .join("\n");

      const poolOverview = Array.from(new Map(cards.map((c) => [c.name, c])).values())
        .slice(0, MAX_POOL_OVERVIEW)
        .map((c) => `${c.name} | ${c.type_line ?? "?"} | ${(c.colors ?? []).join("") || "C"}`)
        .join("\n");

      send({
        type: "status",
        message: `Claude bewertet ${candidates.length} mögliche Commander (kann bis zu 60 Sekunden dauern)...`,
      });

      const anthropic = new Anthropic();

      const anthropicStream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Exakter Name aus der Kandidatenliste" },
                      reasoning: {
                        type: "string",
                        description:
                          "2-4 Sätze Deutsch: warum dieser Commander zur Sammlung passt (konkrete Synergien/" +
                          "Themen/Kartennamen, ggf. verifizierte Combos aus der Liste).",
                      },
                    },
                    required: ["name", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        },
        system:
          "Du bist ein erfahrener Magic: The Gathering Commander-Experte. Du bekommst eine Liste an legendären " +
          "Kreaturen/Planeswalkern, die der Nutzer besitzt und als Commander infrage kommen, eine Übersicht seiner " +
          "gesamten Kartensammlung (Name, Typ, Farben) und eine Liste bereits verifizierter Combos, die sich aus " +
          "Karten in der Sammlung zusammenbauen lassen (unabhängig vom Commander). Wähle die 3-5 Commander-" +
          "Kandidaten aus, die am besten zur Sammlung passen: achte auf Farbidentität (passt sie zu den " +
          "verifizierten Combos?), thematische/tribale/mechanische Synergien in der Sammlung sowie allgemeine " +
          "Stärke als Commander. Begründe jeden Vorschlag konkret mit Kartennamen aus der Sammlung, nicht allgemein. " +
          "Wähle NUR Namen aus der Kandidatenliste, erfinde keine.",
        messages: [
          {
            role: "user",
            content:
              `Commander-Kandidaten aus eigener Sammlung (Name | Farbidentität | Oracle-Text):\n${candidateList}\n\n` +
              `Übersicht der gesamten Sammlung (Name | Typ | Farben):\n${poolOverview}\n\n` +
              `Verifizierte Combos, die sich aus der Sammlung bauen lassen (Karten => Effekt):\n${
                comboSummary || "keine gefunden"
              }`,
          },
        ],
      });

      let lastTick = Date.now();
      anthropicStream.on("text", () => {
        const now = Date.now();
        if (now - lastTick > 3000) {
          lastTick = now;
          send({ type: "status", message: "Claude bewertet die Commander-Kandidaten..." });
        }
      });

      let response;
      try {
        response = await anthropicStream.finalMessage();
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "Anfrage an Claude fehlgeschlagen" });
        controller.close();
        return;
      }

      if (response.stop_reason === "refusal") {
        send({ type: "error", error: "Anfrage wurde abgelehnt" });
        controller.close();
        return;
      }
      if (response.stop_reason === "max_tokens") {
        send({ type: "error", error: "Antwort wurde abgeschnitten (zu lang) - bitte nochmal versuchen." });
        controller.close();
        return;
      }

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        send({ type: "error", error: "Keine Antwort erhalten" });
        controller.close();
        return;
      }

      let parsed: { suggestions: { name: string; reasoning: string }[] };
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        send({ type: "error", error: "Antwort konnte nicht gelesen werden" });
        controller.close();
        return;
      }

      const candidateByName = new Map(candidates.map((c) => [c.name.toLowerCase(), c]));
      const seen = new Set<string>();
      const suggestions = [];
      for (const entry of parsed.suggestions) {
        const key = entry.name.toLowerCase();
        if (seen.has(key)) continue;
        const match = candidateByName.get(key);
        if (!match) continue;
        seen.add(key);
        suggestions.push({
          name: match.name,
          imageUrl: match.image_url,
          colors: match.colors ?? [],
          reasoning: entry.reasoning,
        });
      }

      send({ type: "result", suggestions });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
