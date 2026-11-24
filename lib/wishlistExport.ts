// Wunschliste exportieren (rein): Auswahl nach Ordnern, angefragte Karten
// ausschließen, als Text („1 Name“ – z. B. für Cardmarket-Wants, Moxfield,
// Archidekt) oder CSV.

export type ExportItem = { name: string; price_eur: number | null; folder_ids?: string[] | null };

export type ExportOptions = {
  /** Ordner, die mit hinein sollen */
  folderIds: Set<string>;
  /** Karten ohne Ordner mitnehmen */
  unsorted: boolean;
  /** Kartennamen, die nicht hinein sollen (z. B. schon per Trade angefragt) */
  exclude: Set<string>;
};

export function selectForExport<T extends ExportItem>(items: T[], o: ExportOptions): T[] {
  return items.filter((it) => {
    if (o.exclude.has(it.name)) return false;
    const f = it.folder_ids ?? [];
    if (!f.length) return o.unsorted;
    return f.some((id) => o.folderIds.has(id));
  });
}

/** „1 Kartenname“ je Zeile, gleiche Namen zusammengefasst, alphabetisch. */
export function wishlistToText(items: ExportItem[]): string {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.name, (counts.get(it.name) ?? 0) + 1);
  return Array.from(counts, ([name, n]) => `${n} ${name}`)
    .sort((a, b) => a.replace(/^\d+ /, "").localeCompare(b.replace(/^\d+ /, ""), "de"))
    .join("\n");
}

const csvCell = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV mit Name, Anzahl, Preis (€) und Ordnern. */
export function wishlistToCsv(items: ExportItem[], folderName: (id: string) => string | undefined): string {
  const rows = ["Name,Quantity,Price EUR,Folder"];
  for (const it of [...items].sort((a, b) => a.name.localeCompare(b.name, "de"))) {
    const folders = (it.folder_ids ?? []).map(folderName).filter(Boolean).join("; ");
    rows.push([csvCell(it.name), "1", it.price_eur != null ? it.price_eur.toFixed(2) : "", csvCell(folders)].join(","));
  }
  return rows.join("\n") + "\n";
}

/** Cardmarket: höchstens so viele Einträge je Wants-Liste (Cardmarket-Hilfe „Wants List“). */
export const CARDMARKET_MAX_ENTRIES = 150;

/** Text in Teile mit höchstens `max` Zeilen aufteilen (eine Wants-Liste je Teil). */
export function splitLines(text: string, max = CARDMARKET_MAX_ENTRIES): string[] {
  const lines = text.split("\n").filter(Boolean);
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i += max) parts.push(lines.slice(i, i + max).join("\n"));
  return parts;
}
