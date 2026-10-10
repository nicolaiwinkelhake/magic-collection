"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseDeckList } from "@/lib/parseDeckList";
import { csvToEntries, moxfieldCsvToEntries } from "@/lib/csv";
import {
  buildJob,
  itemStatus,
  notImportedCsv,
  summarizeJob,
  type ImportBatch,
  type ImportJob,
  type ItemStatus,
  type SourceEntry,
} from "@/lib/importJob";

const STORAGE_KEY = "import-job-v1";
const MAX_ATTEMPTS = 3;

const STATUS_LABEL: Record<ItemStatus, string> = {
  imported: "Neu importiert",
  updated: "Menge erhöht",
  skipped: "Schon vorhanden (übersprungen)",
  not_found: "Nicht gefunden",
  error: "Fehler – nicht gespeichert",
  pending: "Noch offen",
};

const STATUS_STYLE: Record<ItemStatus, string> = {
  imported: "text-emerald-400",
  updated: "text-emerald-400",
  skipped: "text-zinc-400",
  not_found: "text-amber-400",
  error: "text-red-400",
  pending: "text-zinc-500",
};

function loadJob(): ImportJob | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ImportJob) : null;
  } catch {
    return null;
  }
}

function saveJob(job: ImportJob | null) {
  try {
    if (job) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Speicher voll/gesperrt: Bericht gilt dann nur für diese Sitzung.
  }
}

// Ein Paket senden, bei Netzwerk-/Serverfehlern mit Pause wiederholen.
// Wiederholen ist gefahrlos: der Server bucht denselben batchKey nie doppelt.
async function sendBatch(batch: ImportBatch, allowDuplicates: boolean): Promise<ImportBatch> {
  let lastError = "Unbekannter Fehler";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch("/api/import/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchKey: batch.key, allowDuplicates, items: batch.items }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const results: ImportBatch["results"] = {};
        for (const r of data.results ?? []) results[r.i] = { status: r.status, cardName: r.cardName };
        return { ...batch, status: "done", replayed: data.replayed, error: undefined, results };
      }
      lastError = data.error ?? `Server antwortet mit ${res.status}`;
      if (res.status === 401) return { ...batch, status: "error", error: "Nicht angemeldet – bitte neu einloggen" };
      if (res.status >= 400 && res.status < 500) break; // Anfrage selbst fehlerhaft, Retry sinnlos
    } catch {
      lastError = "Verbindung abgebrochen";
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return { ...batch, status: "error", error: lastError };
}

export function ImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJobState] = useState<ImportJob | null>(null);
  const [running, setRunning] = useState(false);
  const jobRef = useRef<ImportJob | null>(null);

  const setJob = useCallback((next: ImportJob | null) => {
    jobRef.current = next;
    setJobState(next);
    saveJob(next);
  }, []);

  // Bericht des letzten Imports überlebt Neuladen/Schließen der Seite.
  useEffect(() => {
    const saved = loadJob();
    if (saved) {
      jobRef.current = saved;
      setJobState(saved);
      setOpen(true);
    }
  }, []);

  // Warnung beim Verlassen, solange Pakete unterwegs sind.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  // Arbeitet alle noch nicht erledigten Pakete der Reihe nach ab.
  async function runJob() {
    if (!jobRef.current) return;
    setRunning(true);
    try {
      for (let idx = 0; idx < (jobRef.current?.batches.length ?? 0); idx++) {
        const current = jobRef.current!;
        const batch = current.batches[idx];
        if (batch.status === "done") continue;
        const updated = await sendBatch(batch, current.allowDuplicates);
        const latest = jobRef.current!;
        setJob({ ...latest, batches: latest.batches.map((b, j) => (j === idx ? updated : b)) });
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  async function startImport(entries: SourceEntry[], source: string, mode: "csv" | "text") {
    setNotice(null);
    if (!entries.length) {
      setNotice("Keine Karten erkannt. Bitte Format prüfen (ein Kartenname pro Zeile bzw. CSV mit Spalte „Name“).");
      return;
    }
    const newJob = await buildJob(entries, { source, mode, allowDuplicates });
    setJob(newJob);
    await runJob();
  }

  async function handleTextImport() {
    const entries: SourceEntry[] = [];
    text.split(/\r?\n/).forEach((line, idx) => {
      for (const e of parseDeckList(line)) entries.push({ ...e, line: idx + 1 });
    });
    await startImport(entries, "Texteingabe", "text");
    setText("");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const content = await file.text();

    // CSV mit Scryfall-IDs (Moxfield, ManaBox, ...) → exakte Auflösung per ID
    const moxEntries = moxfieldCsvToEntries(content);
    if (moxEntries) {
      if (!moxEntries.length) {
        setNotice("Die CSV hat eine Spalte „Scryfall ID“, aber keine Zeile mit ID.");
        return;
      }
      await startImport(
        moxEntries.map((m, idx) => ({ ...m, line: idx + 1 })),
        file.name,
        "csv"
      );
    } else {
      await startImport(
        csvToEntries(content).map((c, idx) => ({ ...c, line: idx + 1 })),
        file.name,
        "text"
      );
    }
  }

  function retryFailed() {
    const current = jobRef.current;
    if (!current) return;
    setJob({
      ...current,
      batches: current.batches.map((b) => (b.status === "error" ? { ...b, status: "pending", error: undefined } : b)),
    });
    void runJob();
  }

  function downloadNotImported() {
    if (!job) return;
    const blob = new Blob([notImportedCsv(job)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nicht-importiert-${job.source.replace(/\.csv$/i, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = job ? summarizeJob(job) : null;
  const hasOpen = summary ? summary.pending.items > 0 : false;
  const notImportedCount = summary ? summary.not_found.items + summary.error.items + summary.pending.items : 0;
  const batchErrors = job ? Array.from(new Set(job.batches.filter((b) => b.error).map((b) => b.error!))) : [];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <button onClick={() => setOpen(!open)} className="text-indigo-400 font-medium">
        {open ? "Import schließen ▲" : "Karten importieren ▼"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-zinc-400">
            Ein Kartenname pro Zeile. Menge per „2x Name“, Foil per „Name *F*“.
            Gleiche Karten werden zusammengezählt.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"Lightning Bolt\n2x Black Lotus\nBrainstorm *F*"}
            disabled={running}
            className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTextImport}
              disabled={running || !text.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
            >
              {running ? "Importiere..." : "Importieren"}
            </button>

            <span className="text-zinc-600 text-sm">oder</span>

            <label
              className={`bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition rounded-md px-4 py-2 text-sm ${
                running ? "opacity-50 pointer-events-none" : "cursor-pointer"
              }`}
            >
              CSV-Datei wählen
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                disabled={running}
                className="hidden"
              />
            </label>
            <span className="text-xs text-zinc-500">
              (Moxfield- oder ManaBox-CSV mit Scryfall-ID wird exakt zugeordnet)
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={allowDuplicates}
              onChange={(e) => setAllowDuplicates(e.target.checked)}
              disabled={running}
              className="rounded"
            />
            Duplikate zulassen (Menge bereits vorhandener Karten erhöhen statt überspringen)
          </label>
          <p className="text-xs text-zinc-500">
            Sicher bei Abbruch: Bereits gespeicherte Pakete werden beim erneuten Hochladen derselben Datei
            erkannt und nicht doppelt gebucht.
          </p>
          {notice && <p className="text-sm text-amber-400">{notice}</p>}

          {job && summary && (
            <section className="border-t border-zinc-800 pt-3 space-y-3" aria-live="polite">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">
                  Import „{job.source}“{" "}
                  <span className="text-xs text-zinc-500">
                    {new Date(job.createdAt).toLocaleString("de-DE")}
                  </span>
                </h3>
                <span className="text-sm text-zinc-400">
                  Paket {summary.batchesDone}/{summary.batchesTotal}
                  {running && " – läuft …"}
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-all ${summary.error.items ? "bg-red-500" : "bg-indigo-500"}`}
                  style={{
                    width: `${summary.batchesTotal ? Math.round((summary.batchesDone / summary.batchesTotal) * 100) : 0}%`,
                  }}
                />
              </div>

              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {(["imported", "updated", "skipped", "not_found", "error", "pending"] as ItemStatus[])
                  .filter((st) => summary[st].items > 0)
                  .map((st) => (
                    <li key={st} className="rounded-md bg-zinc-800/60 px-3 py-2">
                      <div className={`font-semibold ${STATUS_STYLE[st]}`}>{summary[st].cards} Karten</div>
                      <div className="text-xs text-zinc-400">{STATUS_LABEL[st]}</div>
                    </li>
                  ))}
              </ul>

              {batchErrors.length > 0 && !running && (
                <p className="text-sm text-red-400">Fehler: {batchErrors.join(" · ")}</p>
              )}

              {!running && (
                <div className="flex flex-wrap gap-2">
                  {summary.error.items > 0 && (
                    <button
                      onClick={retryFailed}
                      className="bg-indigo-600 hover:bg-indigo-500 rounded-md px-3 py-1.5 text-sm font-medium"
                    >
                      Fehlgeschlagene erneut versuchen
                    </button>
                  )}
                  {hasOpen && summary.error.items === 0 && (
                    <button
                      onClick={() => void runJob()}
                      className="bg-indigo-600 hover:bg-indigo-500 rounded-md px-3 py-1.5 text-sm font-medium"
                    >
                      Unterbrochenen Import fortsetzen
                    </button>
                  )}
                  {notImportedCount > 0 && (
                    <button
                      onClick={downloadNotImported}
                      className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-md px-3 py-1.5 text-sm"
                    >
                      Nicht importierte als CSV ({notImportedCount})
                    </button>
                  )}
                  <button
                    onClick={() => setJob(null)}
                    className="text-zinc-400 hover:text-zinc-200 px-3 py-1.5 text-sm"
                  >
                    Bericht schließen
                  </button>
                </div>
              )}

              <ImportDetails job={job} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const DETAIL_ORDER: ItemStatus[] = ["error", "not_found", "pending", "imported", "updated", "skipped"];
const MAX_LIST = 300;

function ImportDetails({ job }: { job: ImportJob }) {
  const groups = new Map<ItemStatus, Array<{ label: string; key: string }>>();
  for (const b of job.batches) {
    for (const it of b.items) {
      const st = itemStatus(b, it);
      const list = groups.get(st) ?? [];
      const shownName = b.results[it.i]?.cardName ?? it.name;
      list.push({
        key: `${b.key}-${it.i}`,
        label: `${it.quantity}× ${shownName}${it.foil ? " (Foil)" : ""}${
          shownName !== it.name ? ` ← „${it.name}“` : ""
        } · Pos. ${it.lines.slice(0, 5).join(", ")}${it.lines.length > 5 ? " …" : ""}`,
      });
      groups.set(st, list);
    }
  }

  return (
    <div className="space-y-1">
      {DETAIL_ORDER.filter((st) => groups.get(st)?.length).map((st) => {
        const list = groups.get(st)!;
        return (
          <details key={st} open={st === "error" || st === "not_found"} className="text-sm">
            <summary className={`cursor-pointer ${STATUS_STYLE[st]}`}>
              {STATUS_LABEL[st]} ({list.length} Positionen)
            </summary>
            <ul className="mt-1 ml-4 max-h-60 overflow-y-auto space-y-0.5 text-zinc-300">
              {list.slice(0, MAX_LIST).map((x) => (
                <li key={x.key}>{x.label}</li>
              ))}
              {list.length > MAX_LIST && (
                <li className="text-zinc-500">… und {list.length - MAX_LIST} weitere (siehe CSV-Download)</li>
              )}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
