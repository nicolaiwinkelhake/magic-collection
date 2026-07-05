import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, fetchGameChangerNames } from "@/lib/scryfall";
import { findCombos } from "@/lib/commanderSpellbook";
import { analyzeBracket } from "@/lib/bracket";

// Die Generierung ist in zwei Phasen gesplittet (Commander-Wahl, Deckbau),
// damit jeder einzelne Request sicher unter Vercels 300s-Limit bleibt -
// ein kombinierter Aufruf lief bei grossen Sammlungen dagegen.
export const maxDuration = 300;

const BASIC_LANDS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
const MAX_COMBO_LINES = 40;

// Offizielle Commander-Bracket-Kriterien (Beta, Stand Februar 2026).
// Quelle: Commander Format Panel / magic.wizards.com, Game Changers via Scryfall.
const BRACKET_RULES: Record<number, { name: string; rules: string }> = {
  2: {
    name: "Bracket 2 – Core (Precon-Niveau)",
    rules:
      "KEINE Game-Changer-Karten (im Pool mit [GC] markiert). Keine 2-Karten-Infinite-Combos, " +
      "keine Massen-Landzerstörung, keine verketteten Extrazüge, Tutoren nur vereinzelt. " +
      "Spiele sollen 8+ Züge dauern. Fokus: rundes, synergetisches Deck mit klarem Thema.",
  },
  3: {
    name: "Bracket 3 – Upgraded (getunt)",
    rules:
      "Maximal DREI Game-Changer-Karten ([GC]). 2-Karten-Infinite-Combos nur, wenn sie " +
      "realistisch erst ab Zug 6+ ausgeführt werden können. Keine Massen-Landzerstörung, " +
      "keine verketteten Extrazüge. Effiziente Manabasis, dichte Synergien, klare Wincons - " +
      "Spiele enden ab Zug 6.",
  },
  4: {
    name: "Bracket 4 – Optimized (High Power)",
    rules:
      "Keine Einschränkungen: beliebig viele Game Changer, schnelles Mana, Tutoren und frühe " +
      "2-Karten-Combos sind erlaubt und erwünscht, wenn sie das Deck stärker machen. " +
      "Ziel: so stark und konsistent wie mit diesem Pool möglich, Spiele enden ab Zug 4.",
  },
  5: {
    name: "Bracket 5 – cEDH (kompetitiv)",
    rules:
      "Maximale Effizienz und Konsistenz: niedrige Mana-Kurve, kompakte Combo-Wincons, viel " +
      "billige Interaktion (Counter, Removal), Fast Mana und Tutoren maximieren. Baue das " +
      "objektiv stärkste Deck, das dieser Pool hergibt - Themen sind egal, nur Gewinnen zählt.",
  },
};

// Allgemeines Deckbau-Grundgerüst, an dem sich der Vorschlag orientieren soll.
const BUILD_GUIDELINES =
  "Grundgerüst eines guten Commander-Decks (99 Karten + Commander): ca. 35-38 Länder " +
  "(bei Bracket 4-5 eher 31-35 zugunsten von Fast Mana), 10-12 Ramp-Karten, 10+ Karten " +
  "Kartenvorteil, 8-12 Interaktion (Spot-Removal, Board Wipes, ggf. Counter) und klar " +
  "erkennbare Wincons, die zur Strategie des Commanders passen. Halte die Mana-Kurve im " +
  "Blick und respektiere STRIKT die Farbidentität des Commanders: keine Karte mit Farben " +
  "außerhalb seiner Farbidentität.";

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

type PoolCard = {
  name: string;
  image_url: string | null;
  type_line: string | null;
  cmc: number | null;
  colors: string[] | null;
  oracle_text: string | null;
  quantity: number;
  available: number;
};

// NDJSON-Stream mit Status-Lebenszeichen. Der gesamte Ablauf ist in try/catch
// gekapselt, damit jeder unerwartete Fehler als "error"-Event beim Client
// ankommt statt als kommentarlos abgebrochener Stream.
function ndjsonStream(run: (send: (obj: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        await run(send);
      } catch (e) {
        try {
          send({ type: "error", error: e instanceof Error ? e.message : "Unerwarteter Fehler" });
        } catch {
          // Stream bereits geschlossen - nichts mehr zu tun.
        }
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

// Claude-Aufruf mit Lebenszeichen an den Client bei JEDEM Stream-Event (auch
// während der Thinking-Phase) - sonst schlägt dessen Idle-Timeout fälschlich zu.
async function runClaude(
  anthropic: Anthropic,
  send: (obj: unknown) => void,
  params: Parameters<Anthropic["messages"]["stream"]>[0],
  workingMessage: string
) {
  const anthropicStream = anthropic.messages.stream(params);
  let lastTick = Date.now();
  anthropicStream.on("streamEvent", () => {
    const now = Date.now();
    if (now - lastTick > 5000) {
      lastTick = now;
      send({ type: "status", message: workingMessage });
    }
  });
  const response = await anthropicStream.finalMessage();

  if (response.stop_reason === "refusal") throw new Error("Anfrage wurde abgelehnt");
  if (response.stop_reason === "max_tokens") {
    throw new Error("Antwort wurde abgeschnitten (zu lang) - bitte nochmal versuchen.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Keine Antwort erhalten");
  return textBlock.text;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ error: "Nicht angemeldet" }, 401);

  const body = await request.json().catch(() => ({}));
  const bracket = Number(body?.bracket);
  const commanderName: string | undefined = body?.commanderName?.trim() || undefined;
  if (!BRACKET_RULES[bracket]) {
    return jsonResponse({ error: "Bracket (2-5) erforderlich" }, 400);
  }

  const { data: collectionCards } = await supabase
    .from("cards")
    .select("name, image_url, type_line, cmc, colors, oracle_text, quantity")
    .eq("user_id", user.id);

  if (!collectionCards || collectionCards.length === 0) {
    return jsonResponse({ error: "Deine Sammlung ist leer." }, 400);
  }

  // Alle bereits verbauten Karten zählen als belegt - inklusive Commander
  // anderer Decks (die stecken physisch genauso in einem Deck).
  const { data: deckCardRows } = await supabase
    .from("deck_cards")
    .select("name")
    .eq("user_id", user.id);

  const { data: existingDecks } = await supabase
    .from("decks")
    .select("commander_name")
    .eq("user_id", user.id);
  const existingCommanders = new Set(
    (existingDecks ?? []).map((d) => d.commander_name.toLowerCase())
  );

  const usedCountByName = new Map<string, number>();
  for (const r of deckCardRows ?? []) {
    const key = r.name.toLowerCase();
    usedCountByName.set(key, (usedCountByName.get(key) ?? 0) + 1);
  }

  const pool: PoolCard[] = (collectionCards ?? [])
    .map((c) => {
      const key = c.name.toLowerCase();
      const used = usedCountByName.get(key) ?? 0;
      const available = BASIC_LANDS.has(key) ? c.quantity : Math.max(0, c.quantity - used);
      return { ...c, available };
    })
    .filter((c) => c.available > 0);

  if (pool.length < 20) {
    return jsonResponse(
      {
        error:
          `Zu wenige freie Karten in deiner Sammlung (${pool.length} verfügbar, mindestens 20 nötig). ` +
          "Karten, die schon in einem anderen Deck verbaut sind, zählen nicht als frei.",
      },
      400
    );
  }

  const bracketInfo = BRACKET_RULES[bracket];
  const anthropic = new Anthropic();

  // ---------------------------------------------------------------
  // Phase 1: Commander-Wahl (kein commanderName im Request).
  // Kompakter Prompt (Pool ohne Oracle-Texte), kleiner Output - schnell.
  // ---------------------------------------------------------------
  if (!commanderName) {
    const candidates = pool.filter(
      (c) => /Legendary/.test(c.type_line ?? "") && /Creature|Planeswalker/.test(c.type_line ?? "")
    );
    if (candidates.length === 0) {
      return jsonResponse(
        { error: "Keine freie legendäre Kreatur/Planeswalker als Commander-Kandidat in deiner Sammlung gefunden." },
        400
      );
    }

    return ndjsonStream(async (send) => {
      send({
        type: "status",
        message: `Phase 1/2: Wähle den besten Commander (${candidates.length} Kandidaten, ${pool.length} freie Karten)...`,
      });

      const gameChangerNames = await fetchGameChangerNames().catch(() => [] as string[]);
      const gcSet = new Set(gameChangerNames.map((n) => n.toLowerCase()));

      send({ type: "status", message: "Suche verifizierte Combos in deiner Sammlung..." });
      const nonBasicNames = Array.from(
        new Set(pool.filter((c) => !BASIC_LANDS.has(c.name.toLowerCase())).map((c) => c.name))
      );
      const poolCombos = await findCombos(nonBasicNames, []);
      const comboSummary = (poolCombos?.included ?? [])
        .slice(0, MAX_COMBO_LINES)
        .map((c) => `${c.cards.join(" + ")} => ${c.produces.join(", ")}`)
        .join("\n");

      const candidateList = candidates
        .map((c) => {
          const colors = (c.colors ?? []).join("") || "C";
          const deckHint = existingCommanders.has(c.name.toLowerCase()) ? " [hat schon ein Deck]" : "";
          return `${c.name}${deckHint} | ${colors} | ${(c.oracle_text ?? "").replace(/\n/g, " ")}`;
        })
        .join("\n");

      // Bewusst OHNE Oracle-Texte: für die Farb-/Synergie-Abschätzung reichen
      // Name, Typ und Farben - das halbiert die Prompt-Größe dieser Phase.
      const poolOverview = pool
        .map((c) => {
          const gc = gcSet.has(c.name.toLowerCase()) ? " [GC]" : "";
          return `${c.name}${gc} | ${c.type_line ?? "?"} | ${(c.colors ?? []).join("") || "C"}`;
        })
        .join("\n");

      send({ type: "status", message: "Claude bewertet die Commander-Kandidaten..." });

      const text = await runClaude(
        anthropic,
        send,
        {
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          output_config: {
            effort: "medium",
            format: {
              type: "json_schema",
              schema: {
                type: "object",
                properties: {
                  commanderName: {
                    type: "string",
                    description: "Exakter Name des besten Commanders aus der Kandidatenliste.",
                  },
                  reasoning: {
                    type: "string",
                    description: "2-4 Sätze Deutsch: warum dieser Commander mit diesem Pool im Ziel-Bracket am stärksten ist.",
                  },
                  alternativeCommanders: {
                    type: "array",
                    description: "2-3 alternative Kandidaten aus der Liste.",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Exakter Name aus der Kandidatenliste" },
                        reasoning: { type: "string", description: "1-2 Sätze Deutsch." },
                      },
                      required: ["name", "reasoning"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["commanderName", "reasoning", "alternativeCommanders"],
                additionalProperties: false,
              },
            },
          },
          system:
            "Du bist ein erfahrener Magic: The Gathering Commander-Experte und kennst das offizielle " +
            `Bracket-System (Beta 2026). Ziel-Bracket: ${bracketInfo.name}. Regeln: ${bracketInfo.rules}\n\n` +
            "Du bekommst die Commander-Kandidaten des Nutzers (mit Oracle-Text), eine kompakte Übersicht " +
            "seines freien Kartenpools (Name, Typ, Farben; [GC] = Game Changer) und verifizierte Combos aus " +
            "dem Pool. Wähle den Kandidaten, mit dem sich aus diesem Pool das stärkste Deck für das " +
            "Ziel-Bracket bauen lässt: genug passende Synergie-Karten in seiner Farbidentität, nutzbare " +
            "Combos, klarer Gameplan. Bevorzuge Kandidaten ohne [hat schon ein Deck]. Wähle NUR Namen aus " +
            "der Kandidatenliste.",
          messages: [
            {
              role: "user",
              content:
                `Commander-Kandidaten (Name | Farbidentität | Oracle-Text):\n${candidateList}\n\n` +
                `Freier Kartenpool (Name [GC?] | Typ | Farben):\n${poolOverview}\n\n` +
                `Verifizierte Combos aus dem Pool (Karten => Effekt):\n${comboSummary || "keine gefunden"}`,
            },
          ],
        },
        "Claude bewertet die Commander-Kandidaten..."
      );

      const parsed: {
        commanderName: string;
        reasoning: string;
        alternativeCommanders: { name: string; reasoning: string }[];
      } = JSON.parse(text);

      const chosen = candidates.find((c) => c.name.toLowerCase() === parsed.commanderName?.toLowerCase());
      if (!chosen) {
        send({ type: "error", error: "Claude hat einen Commander gewählt, der nicht in deiner Sammlung ist - bitte nochmal versuchen." });
        return;
      }

      const alternativeCommanders = (parsed.alternativeCommanders ?? [])
        .filter((a) => a?.name && a.name.toLowerCase() !== chosen.name.toLowerCase())
        .map((a) => {
          const match = candidates.find((c) => c.name.toLowerCase() === a.name.toLowerCase());
          return match ? { name: match.name, imageUrl: match.image_url, reasoning: a.reasoning } : null;
        })
        .filter((a): a is { name: string; imageUrl: string | null; reasoning: string } => a !== null)
        .slice(0, 3);

      send({
        type: "result",
        phase: "commander",
        commander: { name: chosen.name, imageUrl: chosen.image_url },
        reasoning: parsed.reasoning,
        alternativeCommanders,
      });
    });
  }

  // ---------------------------------------------------------------
  // Phase 2: Deckbau für einen festen Commander.
  // Pool ist auf die Farbidentität gefiltert - deutlich kleinerer Prompt.
  // ---------------------------------------------------------------
  const { card, imageUrl, error } = await fetchCardByName(commanderName);
  if (!card) return jsonResponse({ error: error ?? "Commander nicht gefunden" }, 404);
  const identity = card.color_identity ?? card.colors ?? [];
  const commander = { name: card.name, imageUrl, identity, oracle: card.oracle_text ?? "" };

  const deckPool = pool
    .filter((c) => c.name.toLowerCase() !== card.name.toLowerCase())
    .filter((c) => fitsColorIdentity(c.colors, identity));

  if (deckPool.length < 20) {
    return jsonResponse(
      {
        error: `Zu wenige freie, farblich passende Karten für ${card.name} (${deckPool.length} gefunden, mindestens 20 nötig).`,
      },
      400
    );
  }

  return ndjsonStream(async (send) => {
    send({
      type: "status",
      message: `Phase 2/2: Baue ${bracketInfo.name}-Deck für ${commander.name} (${deckPool.length} passende Karten)...`,
    });

    const gameChangerNames = await fetchGameChangerNames().catch(() => [] as string[]);
    const gcSet = new Set(gameChangerNames.map((n) => n.toLowerCase()));

    send({ type: "status", message: "Suche verifizierte Combos für diesen Pool..." });
    const nonBasicNames = Array.from(
      new Set(deckPool.filter((c) => !BASIC_LANDS.has(c.name.toLowerCase())).map((c) => c.name))
    );
    const poolCombos = await findCombos(nonBasicNames, [commander.name]);
    const comboSummary = (poolCombos?.included ?? [])
      .slice(0, MAX_COMBO_LINES)
      .map((c) => `${c.cards.join(" + ")} => ${c.produces.join(", ")}`)
      .join("\n");

    const cardList = deckPool
      .map((c) => {
        const colors = (c.colors ?? []).join("") || "C";
        const gc = gcSet.has(c.name.toLowerCase()) ? " [GC]" : "";
        const qty = c.available > 1 ? ` (x${c.available})` : "";
        const text = c.oracle_text ? ` | ${c.oracle_text.slice(0, 140).replace(/\n/g, " ")}` : "";
        return `${c.name}${gc}${qty} | ${c.type_line ?? "?"} | CMC ${c.cmc ?? 0} | ${colors}${text}`;
      })
      .join("\n");

    send({ type: "status", message: `Claude baut das Deck für ${commander.name}...` });

    const text = await runClaude(
      anthropic,
      send,
      {
        model: "claude-sonnet-4-6",
        // Thinking-Tokens zählen in max_tokens mit - reichlich Luft lassen.
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                deckName: {
                  type: "string",
                  description: "Kurzer, einprägsamer Deckname auf Deutsch (max. 40 Zeichen).",
                },
                strategy: {
                  type: "string",
                  description:
                    "Deck-Strategie auf Deutsch (3-5 Sätze): Gameplan, wie das Deck gewinnt, warum dieser Commander.",
                },
                bracketJustification: {
                  type: "string",
                  description:
                    "2-3 Sätze Deutsch: warum das Deck ins Ziel-Bracket passt (Game-Changer-Anzahl, Combos, Tempo) " +
                    "und wo es innerhalb des Brackets steht.",
                },
                improvementAdvice: {
                  type: "string",
                  description:
                    "Konkrete Einschätzung auf Deutsch, wie das Deck über die verfügbaren Karten hinaus deutlich " +
                    "stärker würde: welche konkreten Karten (auch Nicht-Sammlung) sich lohnen, was im Pool knapp ist, " +
                    "welche Karten sich aus anderen Decks freizumachen lohnen. Beginne mit 'Meiner Meinung nach...'. " +
                    "3-6 Sätze mit Kartennamen, nicht allgemein.",
                },
                cards: {
                  type: "array",
                  description: "Die 99 Karten des Decks (ohne Commander). Basics dürfen quantity > 1 haben.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Exakter Kartenname aus der Pool-Liste" },
                      quantity: {
                        type: "integer",
                        description: "Anzahl (mindestens 1) - nur bei Standardländern größer 1, sonst immer 1.",
                      },
                      category: {
                        type: "string",
                        enum: ["Land", "Ramp", "Removal", "Kartenvorteil", "Wincon", "Synergie", "Sonstiges"],
                      },
                    },
                    required: ["name", "quantity", "category"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["deckName", "strategy", "bracketJustification", "improvementAdvice", "cards"],
              additionalProperties: false,
            },
          },
        },
        system:
          "Du bist ein erfahrener Magic: The Gathering Commander-Deckbuilder und kennst das offizielle " +
          `Bracket-System (Beta 2026). Ziel-Bracket: ${bracketInfo.name}. Regeln: ${bracketInfo.rules}\n\n` +
          `${BUILD_GUIDELINES}\n\n` +
          "Baue das Deck (genau bis zu 99 Karten inkl. Standardländern, ohne Commander) AUSSCHLIESSLICH aus " +
          "der Pool-Liste - erfinde keine Karten. Standardländer (Plains/Island/Swamp/Mountain/Forest/Wastes) " +
          "dürfen mehrfach vorkommen (bis zur angegebenen Anzahl x…), alle anderen Karten genau einmal. " +
          "Karten mit [GC] sind offizielle Game Changer - halte das Limit des Ziel-Brackets strikt ein. " +
          "Wenn der Pool das Ziel-Bracket nicht voll hergibt (z. B. cEDH ohne Fast Mana), baue das " +
          "bestmögliche Deck und sag das ehrlich in bracketJustification und improvementAdvice.",
        messages: [
          {
            role: "user",
            content:
              `Commander: ${commander.name} (Farbidentität: ${identity.join("") || "farblos"})\n` +
              `Oracle-Text Commander: ${commander.oracle}\n\n` +
              `Freier Kartenpool (Name [GC?] (xAnzahl) | Typ | CMC | Farben | Text):\n${cardList}\n\n` +
              `Verifizierte Combos aus dem Pool (Karten => Effekt):\n${comboSummary || "keine gefunden"}`,
          },
        ],
      },
      `Claude baut das Deck für ${commander.name}...`
    );

    const parsed: {
      deckName: string;
      strategy: string;
      bracketJustification: string;
      improvementAdvice: string;
      cards: { name: string; quantity: number; category: string }[];
    } = JSON.parse(text);

    // Kartenliste gegen Pool, Farbidentität und Mengen validieren.
    const poolByName = new Map(deckPool.map((c) => [c.name.toLowerCase(), c]));
    const seen = new Set<string>();
    const cards = [];
    let totalCount = 0;
    for (const entry of parsed.cards ?? []) {
      const key = entry.name?.toLowerCase();
      if (!key || seen.has(key)) continue;
      const match = poolByName.get(key);
      if (!match) continue;
      seen.add(key);
      const isBasic = BASIC_LANDS.has(key);
      const quantity = isBasic
        ? Math.min(Math.max(1, Math.floor(entry.quantity ?? 1)), match.available, 99 - totalCount)
        : 1;
      if (quantity < 1) continue;
      cards.push({
        name: match.name,
        quantity,
        category: entry.category,
        type_line: match.type_line,
        cmc: match.cmc,
        colors: match.colors,
      });
      totalCount += quantity;
      if (totalCount >= 99) break;
    }

    send({ type: "status", message: "Verifiziere Bracket-Einstufung und Combos..." });

    // Unabhängige, regelbasierte Gegenprüfung der Bracket-Einstufung
    // (Game Changer, Massen-Landzerstörung, bekannte 2-Karten-Combos).
    const bracketCheck = analyzeBracket(
      [
        ...cards.map((c) => ({
          name: c.name,
          type_line: c.type_line,
          oracle_text: poolByName.get(c.name.toLowerCase())?.oracle_text ?? null,
          is_commander: false,
        })),
        { name: commander.name, type_line: "Legendary Creature", oracle_text: null, is_commander: true },
      ],
      gameChangerNames
    );

    const combos = await findCombos(
      cards.map((c) => c.name),
      [commander.name]
    );

    send({
      type: "result",
      phase: "deck",
      commander: { name: commander.name, imageUrl: commander.imageUrl, colorIdentity: identity },
      deckName: parsed.deckName,
      strategy: parsed.strategy,
      targetBracket: bracket,
      bracketJustification: parsed.bracketJustification,
      bracketCheck: {
        bracket: bracketCheck.bracket,
        label: bracketCheck.label,
        gameChangers: bracketCheck.gameChangers,
        reasons: bracketCheck.reasons,
      },
      improvementAdvice: parsed.improvementAdvice,
      cards,
      totalCount,
      combos,
    });
  });
}
