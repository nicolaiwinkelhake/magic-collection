export type ParsedEntry = { name: string; quantity: number; foil: boolean };

// Parst Zeilen wie:
//   "Sol Ring"            -> { name: "Sol Ring", quantity: 1, foil: false }
//   "2x Lightning Bolt"   -> { name: "Lightning Bolt", quantity: 2, foil: false }
//   "1 Brainstorm *F*"    -> { name: "Brainstorm", quantity: 1, foil: true }
//   "3 Island (foil)"     -> { name: "Island", quantity: 3, foil: true }
export function parseDeckList(text: string): ParsedEntry[] {
  return text
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => {
      let foil = false;
      let rest = line;

      if (/\*f\*/i.test(rest) || /\(foil\)/i.test(rest)) {
        foil = true;
        rest = rest.replace(/\*f\*/gi, "").replace(/\(foil\)/gi, "").trim();
      }

      const match = rest.match(/^(\d+)\s*x?\s+(.*)$/i);
      if (match) {
        return {
          name: match[2].trim(),
          quantity: Math.max(1, parseInt(match[1], 10)),
          foil,
        };
      }
      return { name: rest, quantity: 1, foil };
    })
    .filter((e) => e.name.length > 0);
}
