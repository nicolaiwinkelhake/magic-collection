import type { ParsedEntry } from "@/lib/parseDeckList";

// Erkennt Trennzeichen und liest eine CSV robust ein (einfacher Parser mit
// Anführungszeichen-Unterstützung). Gibt Zeilen als String-Arrays zurück.
function parseCsvRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delim =
    (firstLine.match(/;/g)?.length ?? 0) >
    (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : firstLine.includes("\t")
      ? "\t"
      : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignorieren
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Moxfield wraps entire rows in quotes when a field contains a comma.
  // Such rows parse as a single field containing the decoded inner CSV.
  // Re-parse those single-field rows as CSV lines.
  return rows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      if (r.length === 1 && r[0].includes(delim)) {
        // re-parse the single field as a CSV row
        const inner = r[0];
        const cols: string[] = [];
        let f = "";
        let q = false;
        for (let i = 0; i < inner.length; i++) {
          const c = inner[i];
          if (q) {
            if (c === '"' && inner[i + 1] === '"') { f += '"'; i++; }
            else if (c === '"') q = false;
            else f += c;
          } else if (c === '"') {
            q = true;
          } else if (c === delim) {
            cols.push(f); f = "";
          } else {
            f += c;
          }
        }
        cols.push(f);
        return cols.length > 1 ? cols : r;
      }
      return r;
    });
}

// Wandelt CSV in Import-Einträge. Sucht typische Spalten aus Moxfield,
// Archidekt, Deckbox etc. (Name/Card Name, Count/Quantity, Foil).
export function csvToEntries(text: string): ParsedEntry[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex((h) =>
    ["name", "card name", "card", "cardname"].includes(h)
  );
  const countIdx = header.findIndex((h) =>
    ["count", "quantity", "qty", "amount"].includes(h)
  );
  const foilIdx = header.findIndex((h) =>
    ["foil", "is foil", "finish", "printing"].includes(h)
  );

  // Kein erkennbarer Header -> jede Zeile als Kartenname behandeln
  const dataRows = nameIdx === -1 ? rows : rows.slice(1);
  const nIdx = nameIdx === -1 ? 0 : nameIdx;

  const entries: ParsedEntry[] = [];
  for (const r of dataRows) {
    const name = (r[nIdx] ?? "").trim();
    if (!name) continue;
    const quantity =
      countIdx >= 0 ? Math.max(1, parseInt(r[countIdx] || "1", 10) || 1) : 1;
    const foilVal = foilIdx >= 0 ? (r[foilIdx] || "").trim().toLowerCase() : "";
    const foil = ["foil", "true", "yes", "1", "etched"].includes(foilVal);
    entries.push({ name, quantity, foil });
  }
  return entries;
}

export type MoxfieldEntry = {
  scryfallId: string;
  name: string;
  quantity: number;
  foil: boolean;
};

// Parst eine Moxfield-CSV mit "Scryfall ID"-Spalte.
// Gibt null zurück wenn das Format nicht erkannt wird (kein Scryfall ID Header).
export function moxfieldCsvToEntries(text: string): MoxfieldEntry[] | null {
  const rows = parseCsvRows(text);
  if (!rows.length) return null;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const scryfallIdx = header.findIndex((h) =>
    ["scryfall id", "scryfall_id", "scryfallid"].includes(h)
  );
  if (scryfallIdx === -1) return null;

  const nameIdx = header.findIndex((h) =>
    ["name", "card name", "card", "cardname"].includes(h)
  );
  const countIdx = header.findIndex((h) =>
    ["count", "quantity", "qty", "amount"].includes(h)
  );
  const foilIdx = header.findIndex((h) =>
    ["foil", "is foil", "finish", "printing"].includes(h)
  );

  return rows.slice(1).flatMap((r): MoxfieldEntry[] => {
    const scryfallId = (r[scryfallIdx] ?? "").trim();
    if (!scryfallId) return [];
    const name = nameIdx >= 0 ? (r[nameIdx] ?? "").trim() : scryfallId;
    const quantity =
      countIdx >= 0 ? Math.max(1, parseInt(r[countIdx] || "1", 10) || 1) : 1;
    const foilVal = foilIdx >= 0 ? (r[foilIdx] || "").trim().toLowerCase() : "";
    const foil = ["foil", "true", "yes", "1", "etched"].includes(foilVal);
    return [{ scryfallId, name, quantity, foil }];
  });
}

// Serialisiert Sammlungskarten als CSV (kompatibel zum eigenen Import).
export function entriesToCsv(
  cards: Array<{
    name: string;
    quantity: number;
    foil: boolean;
    set_code: string | null;
    price_eur: number | null;
    price_eur_foil: number | null;
    condition?: string;
    language?: string;
  }>
): string {
  const esc = (v: string) =>
    /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const head = ["Name", "Count", "Foil", "Set", "Condition", "Language", "Price_EUR"].join(",");
  const lines = cards.map((c) =>
    [
      esc(c.name),
      String(c.quantity),
      c.foil ? "foil" : "",
      esc(c.set_code ?? ""),
      esc(c.condition ?? "NM"),
      esc(c.language ?? "EN"),
      String((c.foil ? c.price_eur_foil : c.price_eur) ?? ""),
    ].join(",")
  );
  return [head, ...lines].join("\n");
}
