import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, fetchGameChangerNames } from "@/lib/scryfall";
import { findCombos } from "@/lib/commanderSpellbook";
import { analyzeBracket } from "@/lib/bracket";

// Kompletter Deck-Vorschlag (ggf. inkl. Commander-Wahl) aus einer grossen
// Sammlung dauert mit Thinking regelmaessig laenger als 120s. Vercel Fluid
// Compute erlaubt bis zu 300s - der Client bricht nicht mehr nach fester
// Gesamtzeit ab, sondern nur wenn der Stream still wird.
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

// Antwort ist NDJSON (ein JSON-Objekt pro Zeile): "status"-Events zeigen dem
// Nutzer live, in welcher Phase die Generierung steckt, und dienen zugleich
// als Lebenszeichen für das Idle-Timeout des Clients.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonResponse({ error: "Nicht angemeldet" }, 401);

  const body = await request.json().catch(() => ({}));
  const bracket = Number(body?.bracket);
  const fixedCommanderName: string | undefined = body?.commanderName?.trim() || undefined;
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

  let pool = (collectionCards ?? [])
    .map((c) => {
      const key = c.name.toLowerCase();
      const used = usedCountByName.get(key) ?? 0;
      const available = BASIC_LANDS.has(key) ? c.quantity : Math.max(0, c.quantity - used);
      return { ...c, available };
    })
    .filter((c) => c.available > 0);

  // Fester Commander: Pool direkt auf seine Farbidentität einschränken.
  let fixedCommander: { name: string; imageUrl: string | null; identity: string[]; oracle: string } | null = null;
  if (fixedCommanderName) {
    const { card, imageUrl, error } = await fetchCardByName(fixedCommanderName);
    if (!card) return jsonResponse({ error: error ?? "Commander nicht gefunden" }, 404);
    const identity = card.color_identity ?? card.colors ?? [];
    fixedCommander = { name: card.name, imageUrl, identity, oracle: card.oracle_text ?? "" };
    pool = pool
      .filter((c) => c.name.toLowerCase() !== card.name.toLowerCase())
      .filter((c) => fitsColorIdentity(c.colors, identity));
  }

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

  // Commander-Kandidaten (nur relevant, wenn Claude selbst wählen soll).
  const candidates = pool.filter(
    (c) => /Legendary/.test(c.type_line ?? "") && /Creature|Planeswalker/.test(c.type_line ?? "")
  );
  if (!fixedCommander && candidates.length === 0) {
    return jsonResponse(
      { error: "Keine freie legendäre Kreatur/Planeswalker als Commander-Kandidat in deiner Sammlung gefunden." },
      400
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      send({
        type: "status",
        message: `Analysiere Kartenpool (${pool.length} freie Karten${fixedCommander ? "" : `, ${candidates.length} Commander-Kandidaten`})...`,
      });

      // Aktuelle Game-Changers-Liste live von Scryfall (is:gamechanger) -
      // Grundlage der Bracket-Regeln. Fällt bei Nichterreichbarkeit auf leer zurück.
      const gameChangerNames = await fetchGameChangerNames().catch(() => [] as string[]);
      const gcSet = new Set(gameChangerNames.map((n) => n.toLowerCase()));

      send({ type: "status", message: "Suche verifizierte Combos in deiner Sammlung..." });

      // Verifizierte Combos aus dem freien Pool (Commander Spellbook) als
      // Entscheidungsgrundlage für Commander-Wahl und Wincon-Planung.
      const nonBasicNames = Array.from(
        new Set(pool.filter((c) => !BASIC_LANDS.has(c.name.toLowerCase())).map((c) => c.name))
      );
      const poolCombos = await findCombos(nonBasicNames, fixedCommander ? [fixedCommander.name] : []);
      const comboSummary = (poolCombos?.included ?? [])
        .slice(0, MAX_COMBO_LINES)
        .map((c) => `${c.cards.join(" + ")} => ${c.produces.join(", ")}`)
        .join("\n");

      const cardList = pool
        .map((c) => {
          const colors = (c.colors ?? []).join("") || "C";
          const gc = gcSet.has(c.name.toLowerCase()) ? " [GC]" : "";
          const qty = c.available > 1 ? ` (x${c.available})` : "";
          const text = c.oracle_text ? ` | ${c.oracle_text.slice(0, 140).replace(/\n/g, " ")}` : "";
          return `${c.name}${gc}${qty} | ${c.type_line ?? "?"} | CMC ${c.cmc ?? 0} | ${colors}${text}`;
        })
        .join("\n");

      const candidateList = candidates
        .map((c) => {
          const colors = (c.colors ?? []).join("") || "C";
          const deckHint = existingCommanders.has(c.name.toLowerCase()) ? " [hat schon ein Deck]" : "";
          return `${c.name}${deckHint} | ${colors} | ${(c.oracle_text ?? "").replace(/\n/g, " ")}`;
        })
        .join("\n");

      const bracketInfo = BRACKET_RULES[bracket];

      const commanderTask = fixedCommander
        ? `Der Commander steht fest: ${fixedCommander.name} (Farbidentität: ${
            fixedCommander.identity.join("") || "farblos"
          }). Oracle-Text: ${fixedCommander.oracle}\nGib exakt diesen Namen als commanderName zurück und lass alternativeCommanders leer.`
        : "Wähle zuerst den besten Commander aus der Kandidatenliste: den, mit dem sich aus diesem " +
          "Pool das stärkste, stimmigste Deck für das Ziel-Bracket bauen lässt (berücksichtige die " +
          "verifizierten Combos und wie viele passende Synergiekarten der Pool je Farbidentität hergibt). " +
          "Bevorzuge Kandidaten ohne [hat schon ein Deck]. Nenne zusätzlich 2-3 alternative Kandidaten " +
          "mit kurzer Begründung. Wähle NUR Namen aus der Kandidatenliste.";

      send({
        type: "status",
        message: fixedCommander
          ? `Claude baut ein ${bracketInfo.name}-Deck für ${fixedCommander.name}...`
          : `Claude wählt den besten Commander und baut ein ${bracketInfo.name}-Deck...`,
      });

      const anthropic = new Anthropic();

      const anthropicStream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        // Adaptive-Thinking-Tokens zaehlen in max_tokens mit rein - bei grossen
        // Sammlungen frisst allein das Nachdenken mehrere tausend Tokens, dazu
        // ~4k fuer die 99-Karten-JSON. 9000 fuehrte zu abgeschnittenen Antworten.
        max_tokens: 32000,
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
                  description: "Exakter Name des gewählten Commanders (aus Kandidatenliste bzw. der Vorgabe).",
                },
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
                alternativeCommanders: {
                  type: "array",
                  description: "2-3 alternative Commander-Kandidaten (leer, wenn Commander vorgegeben war).",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Exakter Name aus der Kandidatenliste" },
                      reasoning: { type: "string", description: "1-2 Sätze Deutsch, warum dieser Kandidat auch stark wäre." },
                    },
                    required: ["name", "reasoning"],
                    additionalProperties: false,
                  },
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
              required: [
                "commanderName",
                "deckName",
                "strategy",
                "bracketJustification",
                "improvementAdvice",
                "alternativeCommanders",
                "cards",
              ],
              additionalProperties: false,
            },
          },
        },
        system:
          "Du bist ein erfahrener Magic: The Gathering Commander-Deckbuilder und kennst das offizielle " +
          "Bracket-System (Beta 2026). Du bekommst den freien Kartenpool des Nutzers (Karten, die er besitzt " +
          "und die in keinem anderen Deck stecken), verifizierte Combos aus diesem Pool und ein Ziel-Bracket. " +
          `\n\nZiel-Bracket: ${bracketInfo.name}. Regeln: ${bracketInfo.rules}\n\n${BUILD_GUIDELINES}\n\n` +
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
              `${commanderTask}\n\n` +
              (fixedCommander
                ? ""
                : `Commander-Kandidaten (Name | Farbidentität | Oracle-Text):\n${candidateList}\n\n`) +
              `Freier Kartenpool (Name [GC?] (xAnzahl) | Typ | CMC | Farben | Text):\n${cardList}\n\n` +
              `Verifizierte Combos aus dem Pool (Karten => Effekt):\n${comboSummary || "keine gefunden"}`,
          },
        ],
      });

      // Lebenszeichen an den Client bei JEDEM Stream-Event (auch während der
      // Thinking-Phase, in der noch kein Text kommt) - sonst schlägt dessen
      // Idle-Timeout während langer Denkphasen fälschlich zu.
      let lastTick = Date.now();
      anthropicStream.on("streamEvent", () => {
        const now = Date.now();
        if (now - lastTick > 5000) {
          lastTick = now;
          send({ type: "status", message: "Claude arbeitet am Deck..." });
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
        commanderName: string;
        deckName: string;
        strategy: string;
        bracketJustification: string;
        improvementAdvice: string;
        alternativeCommanders: { name: string; reasoning: string }[];
        cards: { name: string; quantity: number; category: string }[];
      };
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        send({ type: "error", error: "Antwort konnte nicht gelesen werden" });
        controller.close();
        return;
      }

      // Gewählten Commander auflösen und validieren.
      let commander: { name: string; imageUrl: string | null; identity: string[] };
      if (fixedCommander) {
        commander = { name: fixedCommander.name, imageUrl: fixedCommander.imageUrl, identity: fixedCommander.identity };
      } else {
        const chosen = candidates.find((c) => c.name.toLowerCase() === parsed.commanderName?.toLowerCase());
        if (!chosen) {
          send({ type: "error", error: "Claude hat einen Commander gewählt, der nicht in deiner Sammlung ist - bitte nochmal versuchen." });
          controller.close();
          return;
        }
        // Scryfall liefert die exakte Farbidentität (inkl. Aktivierungskosten etc.).
        const { card, imageUrl } = await fetchCardByName(chosen.name);
        commander = {
          name: chosen.name,
          imageUrl: imageUrl ?? chosen.image_url,
          identity: card?.color_identity ?? chosen.colors ?? [],
        };
      }

      // Kartenliste gegen Pool, Farbidentität und Mengen validieren.
      const poolByName = new Map(pool.map((c) => [c.name.toLowerCase(), c]));
      const seen = new Set<string>();
      const cards = [];
      let totalCount = 0;
      for (const entry of parsed.cards ?? []) {
        const key = entry.name?.toLowerCase();
        if (!key || seen.has(key) || key === commander.name.toLowerCase()) continue;
        const match = poolByName.get(key);
        if (!match) continue;
        if (!fitsColorIdentity(match.colors, commander.identity)) continue;
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
            oracle_text: pool.find((p) => p.name === c.name)?.oracle_text ?? null,
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

      const alternativeCommanders = (parsed.alternativeCommanders ?? [])
        .filter((a) => a?.name && a.name.toLowerCase() !== commander.name.toLowerCase())
        .map((a) => {
          const match = candidates.find((c) => c.name.toLowerCase() === a.name.toLowerCase());
          return match ? { name: match.name, imageUrl: match.image_url, reasoning: a.reasoning } : null;
        })
        .filter((a): a is { name: string; imageUrl: string | null; reasoning: string } => a !== null)
        .slice(0, 3);

      send({
        type: "result",
        commander: { name: commander.name, imageUrl: commander.imageUrl, colorIdentity: commander.identity },
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
        alternativeCommanders,
        cards,
        totalCount,
        combos,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
