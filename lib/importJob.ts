// Client-seitige Planung eines Imports in Paketen (rein, getestet).
//
// Ablauf: Datei/Text → Positionen (gleiche Karte zusammengefasst) → Pakete à
// BATCH_SIZE mit inhaltsbasiertem Schlüssel. Jedes Paket wird einzeln an
// /api/import/batch geschickt und serverseitig atomar + idempotent
// gespeichert (Migration 005). Der Status jeder Position bleibt im Browser
// erhalten, damit man nach einem Abbruch genau weiß, was drin ist.

export const BATCH_SIZE = 100;

export type ImportItem = {
  i: number; // Index innerhalb des Pakets
  name: string;
  quantity: number;
  foil: boolean;
  scryfallId?: string;
  set?: string;
  collectorNumber?: string;
  lines: number[]; // Zeilen in der Quelle (1-basiert), zur Anzeige
};

export type ItemStatus = "pending" | "imported" | "updated" | "skipped" | "not_found" | "error";

export type ImportBatch = {
  key: string;
  items: ImportItem[];
  status: "pending" | "done" | "error";
  replayed?: boolean;
  error?: string;
  // Status je Item-Index (i)
  results: Record<number, { status: ItemStatus; cardName?: string }>;
};

export type ImportJob = {
  id: string;
  source: string; // Dateiname oder "Texteingabe"
  mode: "csv" | "text";
  allowDuplicates: boolean;
  createdAt: string;
  batches: ImportBatch[];
};

export type SourceEntry = {
  name: string;
  quantity: number;
  foil: boolean;
  scryfallId?: string;
  set?: string;
  collectorNumber?: string;
  line: number;
};

// Gleiche Karte (Scryfall-ID bzw. Name, + Foil) über die ganze Quelle
// zusammenfassen. Sonst landet dieselbe Karte in zwei Paketen und das zweite
// würde sie als "schon vorhanden" überspringen statt die Menge zu addieren.
export function groupEntries(entries: SourceEntry[]): Omit<ImportItem, "i">[] {
  const byKey = new Map<string, Omit<ImportItem, "i">>();
  for (const e of entries) {
    const ident = e.scryfallId ? `id:${e.scryfallId.toLowerCase()}` : `name:${e.name.trim().toLowerCase()}`;
    const key = `${ident}|${e.foil ? 1 : 0}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += e.quantity;
      existing.lines.push(e.line);
    } else {
      byKey.set(key, {
        name: e.name.trim(),
        quantity: e.quantity,
        foil: e.foil,
        scryfallId: e.scryfallId,
        set: e.set,
        collectorNumber: e.collectorNumber,
        lines: [e.line],
      });
    }
  }
  return Array.from(byKey.values());
}

export function chunkItems(items: Omit<ImportItem, "i">[], size = BATCH_SIZE): ImportItem[][] {
  const chunks: ImportItem[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size).map((item, i) => ({ ...item, i })));
  }
  return chunks;
}

// Kanonischer Inhalt eines Pakets für den Schlüssel. Zeilennummern gehören
// nicht dazu: dieselben Karten an anderer Stelle der Datei sind dasselbe Paket.
export function batchFingerprint(items: ImportItem[], allowDuplicates: boolean): string {
  return JSON.stringify({
    v: 1,
    dup: allowDuplicates,
    items: items.map((it) => [
      it.scryfallId?.toLowerCase() ?? "",
      it.scryfallId ? "" : it.name.toLowerCase(),
      it.quantity,
      it.foil ? 1 : 0,
    ]),
  });
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildJob(
  entries: SourceEntry[],
  opts: { source: string; mode: "csv" | "text"; allowDuplicates: boolean }
): Promise<ImportJob> {
  const chunks = chunkItems(groupEntries(entries));
  const batches: ImportBatch[] = [];
  for (const items of chunks) {
    batches.push({
      key: await sha256(batchFingerprint(items, opts.allowDuplicates)),
      items,
      status: "pending",
      results: {},
    });
  }
  return {
    id: crypto.randomUUID(),
    source: opts.source,
    mode: opts.mode,
    allowDuplicates: opts.allowDuplicates,
    createdAt: new Date().toISOString(),
    batches,
  };
}

export function itemStatus(batch: ImportBatch, item: ImportItem): ItemStatus {
  return batch.results[item.i]?.status ?? (batch.status === "error" ? "error" : "pending");
}

export type JobSummary = Record<ItemStatus, { items: number; cards: number }> & {
  batchesDone: number;
  batchesTotal: number;
};

export function summarizeJob(job: ImportJob): JobSummary {
  const empty = () => ({ items: 0, cards: 0 });
  const s: JobSummary = {
    pending: empty(),
    imported: empty(),
    updated: empty(),
    skipped: empty(),
    not_found: empty(),
    error: empty(),
    batchesDone: job.batches.filter((b) => b.status === "done").length,
    batchesTotal: job.batches.length,
  };
  for (const b of job.batches) {
    for (const it of b.items) {
      const st = itemStatus(b, it);
      s[st].items += 1;
      s[st].cards += it.quantity;
    }
  }
  return s;
}

function csvField(v: string) {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Alle Positionen, die NICHT in der Sammlung gelandet sind (nicht gefunden,
// Fehler, noch offen) als wieder importierbare CSV.
export function notImportedCsv(job: ImportJob): string {
  const withId = job.mode === "csv";
  const header = withId
    ? ["Count", "Name", "Foil", "Scryfall ID", "Set code", "Collector number", "Status"]
    : ["Count", "Name", "Foil", "Status"];
  const rows = [header.join(",")];
  for (const b of job.batches) {
    for (const it of b.items) {
      const st = itemStatus(b, it);
      if (st === "imported" || st === "updated" || st === "skipped") continue;
      const base = [String(it.quantity), it.name, it.foil ? "foil" : ""];
      const extra = withId ? [it.scryfallId ?? "", it.set ?? "", it.collectorNumber ?? ""] : [];
      rows.push([...base, ...extra, st].map(csvField).join(","));
    }
  }
  return rows.join("\n") + "\n";
}
