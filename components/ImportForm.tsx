"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseDeckList } from "@/lib/parseDeckList";
import { csvToEntries, moxfieldCsvToEntries } from "@/lib/csv";

export function ImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

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

  async function sendEntries(entries: { name: string; quantity: number; foil: boolean }[]) {
    if (!entries.length) return;
    setLoading(true);
    setMessage(null);
    setProgress(null);

    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, allowDuplicates }),
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      setProgress(null);
      setMessage(`Fehler: ${data.error ?? res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: { imported: number; notFound: string[]; skipped: string[] } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "progress") setProgress({ done: event.done, total: event.total });
        else if (event.type === "result") result = event;
      }
    }

    setLoading(false);
    setProgress(null);

    if (!result) {
      setMessage("Fehler: Antwort unvollständig");
      return;
    }
    let msg = `${result.imported} Karte(n) importiert.`;
    if (result.skipped?.length) msg += ` Übersprungen (schon vorhanden): ${result.skipped.join(", ")}`;
    if (result.notFound?.length) msg += ` Nicht gefunden: ${result.notFound.join(", ")}`;
    setPersistedMessage(msg);
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
    if (moxEntries) {
      setLoading(true);
      setMessage(null);
      const res = await fetch("/api/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: moxEntries, allowDuplicates }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setPersistedMessage(`Fehler: ${data.error}`);
      } else {
        let msg = `${data.imported} Karte(n) importiert.`;
        if (data.skipped?.length) msg += ` Übersprungen (schon vorhanden): ${data.skipped.join(", ")}`;
        if (data.notFound?.length) msg += ` Nicht gefunden: ${data.notFound.join(", ")}`;
        setPersistedMessage(msg);
        router.refresh();
      }
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
                ? progress
                  ? `Importiere... (${progress.done}/${progress.total})`
                  : "Importiere..."
                : "Importieren"}
            </button>

            <span className="text-zinc-600 text-sm">oder</span>

            <label className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition rounded-md px-4 py-2 text-sm cursor-pointer">
              CSV-Datei wählen
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
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
