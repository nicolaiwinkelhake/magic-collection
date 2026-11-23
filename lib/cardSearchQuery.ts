// Handeingabe im Scanner (rein, getestet): Ist die Eingabe „Set + Nummer“ –
// so wie es unten links auf der Karte steht – oder ein (Anfang eines) Namens?
// Set + Nummer in beliebiger Reihenfolge: „mkm 94“, „94 mkm“, „MKM-94“, „mkm #94“.
// „plst mkm-94“ meint den Druck aus The List.

export type PrintQuery = { set: string; number: string };
export type SearchQuery = { prints: PrintQuery[]; name: string };

const SET = "([a-z0-9]{2,5})";
const NUM = "#?0*(\\d{1,4}[a-z]?)";
const hasLetter = (s: string) => /[a-z]/.test(s);

export function parseSearchQuery(raw: string): SearchQuery {
  const q = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const prints: PrintQuery[] = [];
  const add = (set: string, number: string) => {
    if (hasLetter(set) && !prints.some((p) => p.set === set && p.number === number)) prints.push({ set, number });
  };
  // The List ausdrücklich: „plst mkm-94“ / „plst mkm 94“
  const list = q.match(new RegExp(`^plst ${SET}[ \\-#]+0*(\\d{1,4}[a-z]?)$`));
  if (list) add("plst", `${list[1].toUpperCase()}-${list[2]}`);
  // Set + Nummer: „mkm 94“, „mkm-94“, „mkm #94“
  // Trenner: Leerzeichen/Bindestrich oder „#“ (ohne Trenner wäre „m15138“ mehrdeutig)
  const setFirst = q.match(new RegExp(`^${SET}(?:[ \\-]+|[ \\-]*#)0*(\\d{1,4}[a-z]?)$`));
  if (setFirst && !list) {
    add(setFirst[1], setFirst[2]);
    // „MKM-94“ kann auch der The-List-Druck sein (so steht er bei Scryfall)
    if (/-/.test(q)) add("plst", `${setFirst[1].toUpperCase()}-${setFirst[2]}`);
  }
  // Nummer + Set: „94 mkm“, „#94 mkm“
  const numFirst = q.match(new RegExp(`^${NUM} ${SET}$`));
  if (numFirst) add(numFirst[2], numFirst[1]);
  return { prints, name: q };
}
