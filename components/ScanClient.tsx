"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@/lib/format";

type Match = {
  id: string;
  name: string;
  imageUrl: string | null;
  eur: number | null;
  eurFoil: number | null;
  typeLine: string;
};

// Schneidet den oberen Namensbereich der Karte aus, das verbessert OCR spürbar.
async function cropNameArea(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const cropH = Math.round(bitmap.height * 0.16); // oberes ~16 %
  const cropW = Math.round(bitmap.width * 0.72); // linke ~72 % (Name, ohne Mana)
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, cropW, cropH, 0, 0, cropW, cropH);
  return canvas.toDataURL("image/png");
}

function cleanOcr(text: string): string {
  return text
    .replace(/[^a-zA-ZÀ-ÿ',\- ]/g, " ") // nur Buchstaben, Apostroph, Komma, Bindestrich
    .replace(/\s+/g, " ")
    .trim();
}

export function ScanClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [recognized, setRecognized] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatch(null);
    setRecognized("");
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    setStatus("Lese Kartenname… (das kann beim ersten Mal kurz dauern)");

    try {
      const cropped = await cropNameArea(file);
      // Tesseract dynamisch laden (nur im Browser)
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(cropped, "eng");
      const name = cleanOcr(data.text).split(",")[0].trim();
      setRecognized(name);
      if (name.length >= 3) {
        await resolve(name);
      } else {
        setStatus("Konnte keinen Namen lesen – bitte manuell eingeben.");
      }
    } catch {
      setStatus("OCR fehlgeschlagen – bitte Namen manuell eingeben.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(name: string) {
    setStatus("Suche Karte bei Scryfall…");
    setMatch(null);
    const res = await fetch(`/api/scryfall/resolve?name=${encodeURIComponent(name)}`);
    if (!res.ok) {
      setStatus(`Keine Karte für „${name}" gefunden. Namen anpassen und erneut suchen.`);
      return;
    }
    const data = await res.json();
    setMatch(data);
    setStatus(null);
  }

  async function confirmAdd() {
    if (!match) return;
    setBusy(true);
    await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [{ name: match.name, quantity: 1, foil: false }] }),
    });
    setBusy(false);
    setAdded((a) => [match.name, ...a]);
    setMatch(null);
    setPreview(null);
    setRecognized("");
    setStatus("Hinzugefügt ✓ Nächste Karte fotografieren.");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8 space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">📷 Karte scannen</h1>
        <Link href="/collection" className="text-indigo-400 hover:underline text-sm">
          Zur Sammlung
        </Link>
      </header>

      <p className="text-sm text-zinc-400">
        Fotografiere eine Karte oder wähle ein Bild. Der Name wird ausgelesen und
        bei Scryfall gesucht – du bestätigst den Treffer, bevor er in die Sammlung
        wandert. Am besten bei gutem Licht und gerade von oben.
      </p>

      <label className="block bg-indigo-600 hover:bg-indigo-500 transition rounded-lg px-4 py-3 text-center font-medium cursor-pointer">
        {busy ? "Arbeite…" : "Karte fotografieren / auswählen"}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
          disabled={busy}
        />
      </label>

      {preview && (
        <img
          src={preview}
          alt="Aufnahme"
          className="w-full rounded-lg border border-zinc-800 max-h-64 object-contain bg-zinc-950"
        />
      )}

      {status && <p className="text-sm text-zinc-300">{status}</p>}

      {/* Manuelle Korrektur des erkannten Namens */}
      {(recognized || match) && (
        <div className="flex gap-2">
          <input
            value={recognized}
            onChange={(e) => setRecognized(e.target.value)}
            placeholder="Erkannter Name"
            className="flex-1 rounded-md bg-zinc-800 px-3 py-2 outline-none"
          />
          <button
            onClick={() => resolve(recognized)}
            disabled={busy || recognized.trim().length < 3}
            className="bg-zinc-700 hover:bg-zinc-600 transition rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            Suchen
          </button>
        </div>
      )}

      {/* Treffer zur Bestätigung */}
      {match && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex gap-4">
          {match.imageUrl && (
            <Image
              src={match.imageUrl}
              alt={match.name}
              width={90}
              height={126}
              className="rounded-md"
            />
          )}
          <div className="flex-1">
            <p className="font-medium">{match.name}</p>
            <p className="text-xs text-zinc-500">{match.typeLine}</p>
            <p className="text-sm text-emerald-400 mt-1">{formatEur(match.eur)}</p>
            <div className="flex gap-3 mt-3">
              <button
                onClick={confirmAdd}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-500 transition rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Zur Sammlung
              </button>
              <button
                onClick={() => {
                  setMatch(null);
                  setStatus("Verworfen.");
                }}
                className="text-zinc-400 hover:underline text-sm"
              >
                Verwerfen
              </button>
            </div>
          </div>
        </div>
      )}

      {added.length > 0 && (
        <div className="text-sm text-zinc-400">
          <p className="mb-1">In dieser Sitzung hinzugefügt:</p>
          <ul className="list-disc list-inside text-zinc-500">
            {added.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
