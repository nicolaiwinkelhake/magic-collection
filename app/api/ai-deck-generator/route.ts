import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName } from "@/lib/scryfall";

const BASIC_LANDS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);

function fitsColorIdentity(cardColors: string[] | null, identity: string[]): boolean {
  if (!cardColors || cardColors.length === 0) return true;
  return cardColors.every((c) => identity.includes(c));
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { commanderName } = await request.json();
  if (!commanderName?.trim()) {
    return NextResponse.json({ error: "Commander-Name erforderlich" }, { status: 400 });
  }

  const { card: commander, imageUrl, error: scryfallError } = await fetchCardByName(commanderName);
  if (!commander) {
    return NextResponse.json({ error: scryfallError ?? "Commander nicht gefunden" }, { status: 404 });
  }
  const colorIdentity = commander.colors ?? [];

  // Sammlung des Nutzers laden
  const { data: collectionCards } = await supabase
    .from("cards")
    .select("name, type_line, cmc, colors, oracle_text, quantity, rarity")
    .eq("user_id", user.id);

  // Zählen, wie oft jede Karte schon in ANDEREN Decks verbaut ist (Commander ausgenommen),
  // damit wir dem Modell nur Karten anbieten, die tatsächlich frei verfügbar sind.
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
    return NextResponse.json(
      {
        error: `Zu wenige freie, passende Karten in deiner Sammlung für ${commander.name} (${pool.length} gefunden, mindestens 20 nötig). Karten, die schon in einem anderen Deck verbaut sind, zählen nicht als frei verfügbar.`,
      },
      { status: 400 }
    );
  }

  const cardList = pool
    .map((c) => {
      const colors = (c.colors ?? []).join("") || "C";
      const text = c.oracle_text ? ` | ${c.oracle_text.slice(0, 140).replace(/\n/g, " ")}` : "";
      return `${c.name} | ${c.type_line ?? "?"} | CMC ${c.cmc ?? 0} | ${colors}${text}`;
    })
    .join("\n");

  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            strategy: {
              type: "string",
              description: "Kurze Erklärung der Deck-Strategie auf Deutsch (2-4 Sätze).",
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
          required: ["strategy", "cards"],
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
      "wähle weniger - Qualität vor Quantität.",
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

  if (response.stop_reason === "refusal") {
    return NextResponse.json({ error: "Anfrage wurde abgelehnt" }, { status: 502 });
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json({ error: "Keine Antwort erhalten" }, { status: 502 });
  }

  let parsed: { strategy: string; cards: { name: string; category: string }[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return NextResponse.json({ error: "Antwort konnte nicht gelesen werden" }, { status: 502 });
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

  return NextResponse.json({
    commander: { name: commander.name, imageUrl, colorIdentity },
    strategy: parsed.strategy,
    cards,
  });
}
