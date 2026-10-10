"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseDeckList } from "@/lib/parseDeckList";
import { csvToEntries, moxfieldCsvToEntries } from "@/lib/csv";

function progressLabel(p: { done: number; total: number; phase?: string } | null) {
  if (!p) return "Importiere...";
  const what = p.phase === "save" ? "Speichere" : "Suche Karten";
  return `${what}... (${p.done}/${p.total})`;
}

export function ImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; phase?: string } | null>(null);

  // Letztes Import-Ergebnis überlebt einen Seiten-Refresh (F5),
  // damit die Liste "nicht gefundener" Karten nicht verloren geht.
  useEffect(() => {
    const saved = window.localStorage.getItem("import-last-message");
    if (saved) setMessage(saved);
  }, []);

  function setPersistedMessage(msg: string) {
    setMessage(msg);
    window.localStorage.setItem("import-last-message", msg);
  }

  type ImportResult = { imported: number; notFound: string[]; skipped: string[]; failed?: string[] };

  // Liest die NDJSON-Stream-Antwort von /api/import bzw. /api/import-csv,
  // aktualisiert den Fortschritt live und gibt am Ende das Result-Event zurück.
  // Jeder Fehlerfall (Netzwerk, Zeitlimit, Serverfehler) endet in einer
  // sichtbaren Meldung statt in einem hängenden "Importiere...".
  async function streamImport(url: string, payload: Record<string, unknown>): Promise<ImportResult | null> {
    setLoading(true);
    setMessage(null);
    setProgress(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMessage(`Fehler: ${data.error ?? `Server antwortet mit ${res.status}`}`);
        return null;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: ImportResult | null = null;
      let serverError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "progress") setProgress({ done: event.done, total: event.total, phase: event.phase });
          else if (event.type === "result") result = event;
          else if (event.type === "error") serverError = event.error;
        }
      }

      if (serverError) {
        setPersistedMessage(`Fehler beim Import: ${serverError}`);
        return null;
      }
      if (!result) {
        setPersistedMessage(
          "Der Import wurde unterbrochen (vermutlich Zeitlimit). Ein Teil der Karten kann schon gespeichert sein – " +
            "bitte Sammlung prüfen und den Rest erneut importieren."
        );
        return null;
      }
      return result;
    } catch {
      setPersistedMessage("Verbindung zum Server abgebrochen. Bitte Sammlung prüfen und erneut versuchen.");
      return null;
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function resultMessage(result: ImportResult) {
    let msg = `${result.imported} Karte(n) importiert.`;
    if (result.skipped?.length) msg += ` Übersprungen (schon vorhanden): ${result.skipped.join(", ")}.`;
    if (result.notFound?.length) msg += ` Nicht gefunden: ${result.notFound.join(", ")}.`;
    if (result.failed?.length) msg += ` Speichern fehlgeschlagen: ${result.failed.join(", ")}.`;
    return msg;
  }

  async function sendEntries(entries: { name: string; quantity: number; foil: boolean }[]) {
    if (!entries.length) {
      setMessage("Keine Karten erkannt. Bitte Format prüfen (ein Kartenname pro Zeile bzw. CSV mit Spalte „Name“).");
      return;
    }
    const result = await streamImport("/api/import", { entries, allowDuplicates });
    if (!result) return;
    setPersistedMessage(resultMessage(result));
    setText("");
    router.refresh();
  }

  async function handleTextImport() {
    await sendEntries(parseDeckList(text));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();

    // CSV mit Scryfall-IDs (Moxfield, ManaBox, ...) → schnelles Endpoint ohne Namens-Lookup
    const moxEntries = moxfieldCsvToEntries(content);
    if (moxEntries && !moxEntries.length) {
      setMessage("Die CSV enthält keine Zeilen mit Scryfall-ID.");
    } else if (moxEntries) {
      const result = await streamImport("/api/import-csv", { entries: moxEntries, allowDuplicates });
      if (result) setPersistedMessage(resultMessage(result));
      // Auch nach Abbruch neu laden: bereits gespeicherte Karten sichtbar machen.
      router.refresh();
    } else {
      await sendEntries(csvToEntries(content));
    }

    if (fileRef.current) fileRef.current.value = "";
  }

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
            className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTextImport}
              disabled={loading || !text.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
            >
              {loading
                ? progressLabel(progress)
                : "Importieren"}
            </button>

            <span className="text-zinc-600 text-sm">oder</span>

            <label
              className={`bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition rounded-md px-4 py-2 text-sm ${
                loading ? "opacity-50 pointer-events-none" : "cursor-pointer"
              }`}
            >
              {loading
                ? progressLabel(progress)
                : "CSV-Datei wählen"}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                disabled={loading}
                className="hidden"
              />
            </label>
            <span className="text-xs text-zinc-500">
              (Moxfield- oder ManaBox-CSV mit Scryfall-ID wird direkt importiert)
            </span>
          </div>
          {progress && progress.total > 0 && (
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={allowDuplicates}
              onChange={(e) => setAllowDuplicates(e.target.checked)}
              className="rounded"
            />
            Duplikate zulassen (Menge bereits vorhandener Karten erhöhen statt überspringen)
          </label>
          {message && <p className="text-sm text-zinc-300">{message}</p>}
        </div>
      )}
    </div>
  );
}
