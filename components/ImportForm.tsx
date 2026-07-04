"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseDeckList } from "@/lib/parseDeckList";
import { csvToEntries } from "@/lib/csv";

export function ImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function sendEntries(entries: { name: string; quantity: number; foil: boolean }[]) {
    if (!entries.length) return;
    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(`Fehler: ${data.error}`);
      return;
    }
    let msg = `${data.imported} Karte(n) importiert.`;
    if (data.notFound?.length) msg += ` Nicht gefunden: ${data.notFound.join(", ")}`;
    setMessage(msg);
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
    await sendEntries(csvToEntries(content));
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
              {loading ? "Importiere..." : "Importieren"}
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
              (Moxfield / Archidekt / Deckbox)
            </span>
          </div>
          {message && <p className="text-sm text-zinc-300">{message}</p>}
        </div>
      )}
    </div>
  );
}
