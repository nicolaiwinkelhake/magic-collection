import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName } from "@/lib/scryfall";
import { findCombos } from "@/lib/commanderSpellbook";

// Adaptive Thinking + eine grosse Kandidatenliste + ~99 Karten als JSON
// brauchen mehr Zeit, als Vercels Standard-Timeout fuer Route Handler erlaubt.
export const maxDuration = 120;

const BASIC_LANDS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);

function fitsColorIdentity(cardColors: string[] | null, identity: string[]): boolean {
  if (!cardColors || cardColors.length === 0) return true;
  return cardColors.every((c) => identity.includes(c));
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Antwort ist NDJSON (ein JSON-Objekt pro Zeile): "status"-Events zeigen dem
// Nutzer live, in welcher Phase die Generierung gerade steckt (Claude braucht
// bei grossen Sammlungen 30-90s), statt dass der Button minutenlang ohne
// jedes Feedback haengt.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ error: "Nicht angemeldet" }, 401);

  const { commanderName } = await request.json();
  if (!commanderName?.trim()) {
    return jsonResponse({ error: "Commander-Name erforderlich" }, 400);
  }

  const { card: commander, imageUrl, error: scryfallError } = await fetchCardByName(commanderName);
  if (!commander) {
    return jsonResponse({ error: scryfallError ?? "Commander nicht gefunden" }, 404);
  }
  const colorIdentity = commander.colors ?? [];

  const { data: collectionCards } = await supabase
    .from("cards")
    .select("name, type_line, cmc, colors, oracle_text, quantity, rarity")
    .eq("user_id", user.id);

  const { data: deckCardRows } = await supabase
    .from("deck_cards")
    .select("name")
    .eq("user_id", user.id)
    .eq("is_commander", false);

  const usedCountByName = new Map<string, number>();
  for (const r of deckCardRows ?? []) {
    const key = r.name.toLowerCase();
    usedCountByName.set(key, (usedCountByName.get(key) ?? 0) + 1);
  }

  const pool = (collectionCards ?? [])
    .filter((c) => c.name.toLowerCase() !== commander.name.toLowerCase())
    .map((c) => {
      const key = c.name.toLowerCase();
      const used = usedCountByName.get(key) ?? 0;
      const available = BASIC_LANDS.has(key) ? c.quantity : Math.max(0, c.quantity - used);
      return { ...c, available };
    })
    .filter((c) => c.available > 0)
    .filter((c) => fitsColorIdentity(c.colors, colorIdentity));

  if (pool.length < 20) {
    return jsonResponse(
      {
        error: `Zu wenige freie, passende Karten in deiner Sammlung für ${commander.name} (${pool.length} gefunden, mindestens 20 nötig). Karten, die schon in einem anderen Deck verbaut sind, zählen nicht als frei verfügbar.`,
      },
      400
    );
  }

  const cardList = pool
    .map((c) => {
      const colors = (c.colors ?? []).join("") || "C";
      const text = c.oracle_text ? ` | ${c.oracle_text.slice(0, 140).replace(/\n/g, " ")}` : "";
      return `${c.name} | ${c.type_line ?? "?"} | CMC ${c.cmc ?? 0} | ${colors}${text}`;
    })
    .join("\n");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      send({ type: "status", message: `Baue Kartenpool für ${commander.name} (${pool.length} Karten verfügbar)...` });

      const anthropic = new Anthropic();

      const anthropicStream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                strategy: {
                  type: "string",
                  description: "Kurze Erklärung der Deck-Strategie auf Deutsch (2-4 Sätze).",
                },
                improvementAdvice: {
                  type: "string",
                  description:
                    "Persönliche, konkrete Einschätzung auf Deutsch, wie das Deck über die aktuell " +
                    "verfügbaren Karten hinaus noch deutlich stärker würde - z. B. welche Farben/Länder " +
                    "in der Sammlung knapp sind, welche Karten sich lohnen würden aus einem anderen Deck " +
                    "freizumachen, oder welche konkreten Magic-Karten (auch wenn nicht in der Sammlung) " +
                    "das Deck am meisten verbessern würden. Beginne mit 'Meiner Meinung nach...'. " +
                    "3-6 Sätze, konkret und mit Kartennamen, nicht allgemein.",
                },
                cards: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Exakter Kartenname aus der Liste" },
                      category: {
                        type: "string",
                        enum: ["Land", "Ramp", "Removal", "Kartenvorteil", "Wincon", "Synergie", "Sonstiges"],
                      },
                    },
                    required: ["name", "category"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["strategy", "improvementAdvice", "cards"],
              additionalProperties: false,
            },
          },
        },
        system:
          "Du bist ein erfahrener Magic: The Gathering Commander-Deckbuilder. Du bekommst einen Commander " +
          "und eine Liste an Karten, die der Nutzer bereits besitzt und aktuell in keinem anderen Deck " +
          "verbaut hat. Baue daraus das stärkste, gut abgestimmte 99-Karten-Deck (ohne Commander) " +
          "NUR aus dieser Liste - erfinde keine Karten und nutze keine Karte, die nicht in der Liste steht. " +
          "Achte auf eine gute Balance aus Landbase (ca. 36-38 Länder), Ramp, Removal, Kartenvorteil und " +
          "Wincons passend zur Strategie des Commanders. Wenn weniger als 99 passende Karten sinnvoll sind, " +
          "wähle weniger - Qualität vor Quantität. Gib zusätzlich eine ehrliche, konkrete Einschätzung " +
          "(improvementAdvice), was dem Deck aktuell fehlt (z. B. zu wenig Länder) und was der Nutzer " +
          "konkret tun könnte, um daraus ein wirklich starkes Deck zu machen.",
        messages: [
          {
            role: "user",
            content:
              `Commander: ${commander.name} (Farbidentität: ${colorIdentity.join("") || "farblos"})\n` +
              `Oracle-Text Commander: ${commander.oracle_text ?? ""}\n\n` +
              `Verfügbare Karten aus der Sammlung (Name | Typ | CMC | Farben | Text):\n${cardList}`,
          },
        ],
      });

      send({ type: "status", message: "Claude entwirft das Deck (kann bis zu 90 Sekunden dauern)..." });

      let lastTick = Date.now();
      anthropicStream.on("text", () => {
        // Grobes Lebenszeichen, damit der Nutzer sieht, dass Claude tatsächlich
        // noch arbeitet, statt eine feste Zeit lang gar nichts zu sehen.
        const now = Date.now();
        if (now - lastTick > 3000) {
          lastTick = now;
          send({ type: "status", message: "Claude entwirft das Deck..." });
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

      let parsed: {
        strategy: string;
        improvementAdvice: string;
        cards: { name: string; category: string }[];
      };
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        send({ type: "error", error: "Antwort konnte nicht gelesen werden" });
        controller.close();
        return;
      }

      const poolByName = new Map(pool.map((c) => [c.name.toLowerCase(), c]));
      const seen = new Set<string>();
      const cards = [];
      for (const entry of parsed.cards) {
        const key = entry.name.toLowerCase();
        if (seen.has(key)) continue;
        const match = poolByName.get(key);
        if (!match) continue;
        seen.add(key);
        cards.push({
          name: match.name,
          category: entry.category,
          type_line: match.type_line,
          cmc: match.cmc,
          colors: match.colors,
        });
        if (cards.length >= 99) break;
      }

      send({ type: "status", message: "Prüfe verifizierte Combos..." });

      // Echte, verifizierte Combos (statt KI-Vermutungen) über Commander Spellbook prüfen -
      // sowohl im gebauten Deck vorhandene als auch solche, denen nur 1-2 Karten fehlen.
      const combos = await findCombos(
        cards.map((c) => c.name),
        [commander.name]
      );

      send({
        type: "result",
        commander: { name: commander.name, imageUrl, colorIdentity },
        strategy: parsed.strategy,
        improvementAdvice: parsed.improvementAdvice,
        cards,
        combos,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
