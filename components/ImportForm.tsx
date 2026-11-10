"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fileToEntries, textToEntries } from "@/lib/importSource";
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

const MAX_ATTEMPTS = 3;

// Derselbe robuste Import (Pakete, Wiederholen, Bericht, Fortsetzen nach
// Abbruch) für verschiedene Ziele.
export type ImportTarget = "collection" | "wishlist";

const TARGETS: Record<
  ImportTarget,
  { endpoint: string; storageKey: string; title: string; duplicates: boolean; labels: Partial<Record<ItemStatus, string>> }
> = {
  collection: {
    endpoint: "/api/import/batch",
    storageKey: "import-job-v1",
    title: "Karten importieren",
    duplicates: true,
    labels: {},
  },
  wishlist: {
    endpoint: "/api/wishlist/import",
    storageKey: "import-job-wishlist-v1",
    title: "Karten zur Wunschliste hinzufügen",
    duplicates: false,
    labels: { imported: "Neu auf der Wunschliste", skipped: "Stand schon drauf" },
  },
};

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

function loadJob(storageKey: string): ImportJob | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as ImportJob) : null;
  } catch {
    return null;
  }
}

function saveJob(storageKey: string, job: ImportJob | null) {
  try {
    if (job) window.localStorage.setItem(storageKey, JSON.stringify(job));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Speicher voll/gesperrt: Bericht gilt dann nur für diese Sitzung.
  }
}

// Ein Paket senden, bei Netzwerk-/Serverfehlern mit Pause wiederholen.
// Wiederholen ist gefahrlos: der Server bucht denselben batchKey nie doppelt.
async function sendBatch(endpoint: string, batch: ImportBatch, allowDuplicates: boolean): Promise<ImportBatch> {
  let lastError = "Unbekannter Fehler";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchKey: batch.key, allowDuplicates, items: batch.items }),
      });
      const data = await res.json().catch(() => ({}));
      // Ohne Ergebnisliste (z. B. Umleitung auf eine HTML-Seite) gilt das
      // Paket nicht als erledigt.
      if (res.ok && Array.isArray(data.results)) {
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

export function ImportForm({ target = "collection", defaultOpen = false }: { target?: ImportTarget; defaultOpen?: boolean }) {
  const cfg = TARGETS[target];
  const label = (st: ItemStatus) => cfg.labels[st] ?? STATUS_LABEL[st];
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(defaultOpen);
  const [activeBatch, setActiveBatch] = useState<number | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [job, setJobState] = useState<ImportJob | null>(null);
  const [running, setRunning] = useState(false);
  const jobRef = useRef<ImportJob | null>(null);

  const setJob = useCallback((next: ImportJob | null) => {
    jobRef.current = next;
    setJobState(next);
    saveJob(cfg.storageKey, next);
  }, [cfg.storageKey]);

  // Bericht des letzten Imports überlebt Neuladen/Schließen der Seite.
  useEffect(() => {
    const saved = loadJob(cfg.storageKey);
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
        setActiveBatch(idx);
        const updated = await sendBatch(cfg.endpoint, batch, current.allowDuplicates);
        const latest = jobRef.current!;
        setJob({ ...latest, batches: latest.batches.map((b, j) => (j === idx ? updated : b)) });
      }
    } finally {
      setActiveBatch(null);
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
    const newJob = await buildJob(entries, { source, mode, allowDuplicates: cfg.duplicates && allowDuplicates });
    setJob(newJob);
    await runJob();
  }

  async function handleTextImport() {
    const parsed = textToEntries(text);
    if (parsed.problem) {
      setNotice(parsed.problem);
      return;
    }
    await startImport(parsed.entries, "Texteingabe", parsed.mode);
    setText("");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    let content: string;
    try {
      content = await file.text();
    } catch {
      setNotice("Die Datei konnte nicht gelesen werden.");
      return;
    }
    const parsed = fileToEntries(content);
    if (parsed.problem) {
      setNotice(parsed.problem);
      return;
    }
    await startImport(parsed.entries, file.name, parsed.mode);
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
    <div className={`rounded-xl border border-white/10 ${open ? "bg-zinc-900/80 p-4" : "bg-white/5"}`}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-3 text-sm font-medium ${open ? "" : "px-4 py-3"}`}
      >
        <span className="flex items-center gap-2">
          <span className="grid place-items-center w-7 h-7 rounded-full bg-indigo-500 text-white text-lg leading-none" aria-hidden>
            +
          </span>
          {cfg.title}
          <span className="hidden sm:inline text-xs font-normal text-zinc-500">Liste oder CSV (z. B. ManaBox/Moxfield)</span>
        </span>
        <span className={`text-zinc-500 transition ${open ? "rotate-180" : ""}`} aria-hidden>
          ▾
        </span>
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
          {cfg.duplicates && (
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
          )}
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

              <ImportProgress job={job} activeBatch={activeBatch} running={running} />

              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {(["imported", "updated", "skipped", "not_found", "error", "pending"] as ItemStatus[])
                  .filter((st) => summary[st].items > 0)
                  .map((st) => (
                    <li key={st} className="rounded-md bg-zinc-800/60 px-3 py-2">
                      <div className={`font-semibold ${STATUS_STYLE[st]}`}>{summary[st].cards} Karten</div>
                      <div className="text-xs text-zinc-400">{label(st)}</div>
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

              <ImportDetails job={job} label={label} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const DETAIL_ORDER: ItemStatus[] = ["error", "not_found", "pending", "imported", "updated", "skipped"];
const MAX_LIST = 300;

function ImportDetails({ job, label }: { job: ImportJob; label: (st: ItemStatus) => string }) {
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
              {label(st)} ({list.length} Positionen)
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

// Ladebalken nach Karten (nicht nach Paketen): erledigte Pakete grün bzw.
// rot bei Fehlern, das gerade laufende Paket als pulsierender Abschnitt.
export function ImportProgress({
  job,
  activeBatch,
  running,
}: {
  job: ImportJob;
  activeBatch: number | null;
  running: boolean;
}) {
  const sizeOf = (b: ImportJob["batches"][number]) => b.items.reduce((n, it) => n + it.quantity, 0);
  const total = job.batches.reduce((n, b) => n + sizeOf(b), 0) || 1;
  const done = job.batches.filter((b) => b.status === "done").reduce((n, b) => n + sizeOf(b), 0);
  const failed = job.batches.filter((b) => b.status === "error").reduce((n, b) => n + sizeOf(b), 0);
  const active = activeBatch != null && running ? sizeOf(job.batches[activeBatch]) : 0;
  const pct = (n: number) => `${(n / total) * 100}%`;
  const percent = Math.round((done / total) * 100);

  return (
    <div className="space-y-1">
      <div
        className="flex w-full h-3 rounded-full bg-zinc-800 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Importfortschritt"
      >
        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: pct(done) }} />
        {failed > 0 && <div className="h-full bg-red-500 transition-all duration-500" style={{ width: pct(failed) }} />}
        {active > 0 && <div className="h-full bg-indigo-400/70 animate-pulse transition-all" style={{ width: pct(active) }} />}
      </div>
      <p className="flex justify-between text-xs text-zinc-400 tabular-nums">
        <span>
          {done} von {total} Karten verarbeitet
          {failed > 0 && <span className="text-red-400"> · {failed} fehlgeschlagen</span>}
        </span>
        <span>{percent} %</span>
      </p>
    </div>
  );
}
