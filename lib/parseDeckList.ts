export type ParsedEntry = { name: string; quantity: number; foil: boolean; set?: string; collectorNumber?: string };

// Set-Code + Sammlernummer, wie Moxfield, Archidekt und MTG Arena sie
// exportieren: "Sol Ring (C21) 263", "Island (ltr) 715", "Opt (PLST) XLN-65",
// "Forest (UNF) 239★". Die Nummer ist optional ("Sol Ring (C21)").
const PRINT = /\s*\(([a-z0-9]{2,6})\)(?:\s+([0-9a-z][0-9a-z★†\-]*))?/i;

// Entfernt Kategorie-Tags und Marker aus Kartennamen.
// Beispiel: "Sol Ring [Ramp] ^Have^" → "Sol Ring"
function stripTags(name: string): string {
  return name
    .replace(/\s*\[[^\]]*\]/g, "") // [Removal]
    .replace(/\s*\^[^^]*\^/g, "") // ^Tag^ (Archidekt)
    .trim();
}

// Druck (Set + Nummer) aus der Zeile lösen; der Rest ist der Name.
function splitPrint(text: string): { name: string; set?: string; collectorNumber?: string } {
  const m = text.match(PRINT);
  if (!m) return { name: stripTags(text) };
  const name = stripTags((text.slice(0, m.index) + " " + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " "));
  return {
    name,
    set: m[1].toLowerCase(),
    ...(m[2] ? { collectorNumber: m[2] } : {}),
  };
}

// Parst Zeilen wie:
//   "Sol Ring"                 -> { name: "Sol Ring", quantity: 1, foil: false }
//   "2x Lightning Bolt"        -> { name: "Lightning Bolt", quantity: 2, foil: false }
//   "1 Brainstorm *F*"         -> { name: "Brainstorm", quantity: 1, foil: true }
//   "3 Island (foil)"          -> { name: "Island", quantity: 3, foil: true }
//   "1 Sol Ring (C21) 263 *F*" -> { name: "Sol Ring", quantity: 1, foil: true, set: "c21", collectorNumber: "263" }
export function parseDeckList(text: string): ParsedEntry[] {
  return text
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => {
      let foil = false;
      let rest = line;

      if (/\*[fe]\*/i.test(rest) || /\((foil|etched)\)/i.test(rest)) {
        foil = true;
        rest = rest.replace(/\*[fe]\*/gi, "").replace(/\((foil|etched)\)/gi, "").trim();
      }

      let quantity = 1;
      const match = rest.match(/^(\d+)\s*x?\s+(.*)$/i);
      if (match) {
        quantity = Math.max(1, parseInt(match[1], 10));
        rest = match[2].trim();
      }
      const { name, set, collectorNumber } = splitPrint(rest);
      return { name, quantity, foil, ...(set ? { set } : {}), ...(collectorNumber ? { collectorNumber } : {}) };
    })
    .filter((e) => e.name.length > 0);
}
