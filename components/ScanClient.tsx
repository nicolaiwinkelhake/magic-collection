"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Worker } from "tesseract.js";
import { formatEur } from "@/lib/format";
import { nameCandidates, parseCardInfo, preprocessPixels, type CardInfo, type OcrLine } from "@/lib/ocr";

type Match = {
  id: string;
  name: string;
  imageUrl: string | null;
  eur: number | null;
  eurFoil: number | null;
  typeLine: string;
  set?: string;
  setName?: string | null;
  collectorNumber?: string;
  exact?: boolean;
  suggestions?: string[];
};

// Bereiche relativ zur Karte: Namensbalken oben, Infozeile unten links
// (Sammlernummer, Set-Kürzel, Sprache – gibt es auf Karten ab 2015).
const NAME_AREA = { x: 0.04, y: 0.02, w: 0.8, h: 0.09 };
const INFO_AREA = { x: 0.02, y: 0.91, w: 0.53, h: 0.08 };
const CARD_RATIO = 63 / 88; // Breite / Höhe einer Magic-Karte
const MIN_OCR_HEIGHT = 140;

type Rect = { x: number; y: number; w: number; h: number }; // relativ 0–1

// Kartenrahmen im Videobild: möglichst groß, mittig, im Kartenformat.
function cardGuide(videoW: number, videoH: number): Rect {
  let h = videoH * 0.9;
  let w = h * CARD_RATIO;
  if (w > videoW * 0.9) {
    w = videoW * 0.9;
    h = w / CARD_RATIO;
  }
  return { x: (videoW - w) / 2 / videoW, y: (videoH - h) / 2 / videoH, w: w / videoW, h: h / videoH };
}

// Teilbereich (relativ zur Karte) in Pixel des Quellbilds umrechnen.
function subArea(card: Rect, area: Rect, srcW: number, srcH: number) {
  return {
    sx: (card.x + area.x * card.w) * srcW,
    sy: (card.y + area.y * card.h) * srcH,
    sw: area.w * card.w * srcW,
    sh: area.h * card.h * srcH,
  };
}

// Bildausschnitt in ein aufbereitetes Canvas (vergrößert, Kontrast) kopieren.
function regionToCanvas(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): HTMLCanvasElement {
  const scale = Math.max(1, MIN_OCR_HEIGHT / sh);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  preprocessPixels(img.data);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function ScanClient() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [guide, setGuide] = useState<Rect>({ x: 0.15, y: 0.05, w: 0.7, h: 0.9 });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recognized, setRecognized] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [foil, setFoil] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState<Array<{ name: string; quantity: number; foil: boolean }>>([]);

  // Aufräumen: Kamera aus, Texterkennung beenden.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void workerRef.current?.terminate();
    };
  }, []);

  // Kamerastrom ans Video hängen, sobald das Element angezeigt wird.
  useEffect(() => {
    const video = videoRef.current;
    if (cameraOn && video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.onloadedmetadata = () => setGuide(cardGuide(video.videoWidth, video.videoHeight));
      void video.play().catch(() => {});
    }
  }, [cameraOn]);

  // Texterkennung einmal laden und wiederverwenden (Deutsch + Englisch).
  async function getWorker(): Promise<Worker> {
    if (workerRef.current) return workerRef.current;
    setStatus("Lade Texterkennung (nur beim ersten Mal)…");
    const { createWorker } = await import("tesseract.js");
    workerRef.current = await createWorker(["eng", "deu"]);
    return workerRef.current;
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      void getWorker().then(() => setStatus(null));
    } catch {
      setCameraError("Kamera nicht verfügbar oder nicht erlaubt. Du kannst stattdessen ein Foto auswählen.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function ocrLines(canvas: HTMLCanvasElement): Promise<OcrLine[]> {
    const worker = await getWorker();
    setStatus("Lese Kartennamen…");
    const { data } = await worker.recognize(canvas);
    const lines = (data.lines ?? []).map((l) => ({ text: l.text, confidence: l.confidence }));
    return lines.length ? lines : [{ text: data.text, confidence: data.confidence }];
  }

  // Kandidaten nacheinander bei Scryfall prüfen, erster Treffer gewinnt.
  // Set + Nummer (falls gelesen) bestimmen den genauen Druck.
  async function resolveCandidates(candidates: string[], info: CardInfo | null) {
    const printKnown = Boolean(info?.set && info?.number);
    if (!candidates.length && !printKnown) {
      setStatus("Kein Name erkannt – Karte besser ausrichten oder Namen eintippen.");
      setRecognized("");
      return;
    }
    setRecognized(candidates[0] ?? "");
    for (const c of candidates.length ? candidates : [""]) {
      if (await resolve(c, true, info)) return;
    }
  }

  async function readInfo(source: CanvasImageSource, card: Rect, w: number, h: number): Promise<CardInfo | null> {
    const a = subArea(card, INFO_AREA, w, h);
    const lines = await ocrLines(regionToCanvas(source, a.sx, a.sy, a.sw, a.sh));
    const info = parseCardInfo(lines.map((l) => l.text).join(" "));
    return info.set || info.number ? info : null;
  }

  async function scanFromCamera() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    setMatch(null);
    try {
      const W = video.videoWidth;
      const H = video.videoHeight;
      const n = subArea(guide, NAME_AREA, W, H);
      const names = nameCandidates(await ocrLines(regionToCanvas(video, n.sx, n.sy, n.sw, n.sh)));
      const info = await readInfo(video, guide, W, H);
      await resolveCandidates(names, info);
    } catch {
      setStatus("Lesen fehlgeschlagen – bitte erneut versuchen oder Namen eintippen.");
    } finally {
      setBusy(false);
    }
  }

  // Foto/Galerie: obere Bildhälfte Zeile für Zeile lesen (Lage der Karte unbekannt).
  async function scanFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    setMatch(null);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const maxW = 1600;
      const scale = Math.min(1, maxW / bitmap.width);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      const full = document.createElement("canvas");
      full.width = w;
      full.height = h;
      full.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
      // Foto zeigt (fast) nur die Karte → Bereiche wie im Kamerarahmen;
      // sonst Name zeilenweise aus der oberen Bildhälfte.
      const ratio = w / h;
      if (ratio > 0.62 && ratio < 0.82) {
        const whole: Rect = { x: 0, y: 0, w: 1, h: 1 };
        const n = subArea(whole, NAME_AREA, w, h);
        const names = nameCandidates(await ocrLines(regionToCanvas(full, n.sx, n.sy, n.sw, n.sh)));
        const info = await readInfo(full, whole, w, h);
        await resolveCandidates(names, info);
      } else {
        await resolveCandidates(nameCandidates(await ocrLines(regionToCanvas(full, 0, 0, w, h * 0.5)), 4), null);
      }
    } catch {
      setStatus("Bild konnte nicht gelesen werden – bitte Namen eintippen.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(name: string, quiet = false, info: CardInfo | null = null): Promise<boolean> {
    const printLabel = info?.set ? ` (${info.set.toUpperCase()} ${info.number ?? ""})` : "";
    setStatus(`Suche ${name ? `„${name}“` : "Karte"}${printLabel} bei Scryfall…`);
    const params = new URLSearchParams({ name });
    if (info?.set && info.number) {
      params.set("set", info.set);
      params.set("number", info.number);
    }
    const res = await fetch(`/api/scryfall/resolve?${params}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSuggestions(data?.suggestions ?? []);
    if (!res?.ok || !data?.name) {
      setStatus(
        quiet
          ? `Keine Karte für „${name}“ gefunden. Namen korrigieren oder Vorschlag antippen.`
          : data?.error ?? "Nicht gefunden."
      );
      return false;
    }
    setMatch(data);
    setRecognized(data.name);
    setFoil(false);
    setQuantity(1);
    setStatus(null);
    return true;
  }

  async function confirmAdd() {
    if (!match) return;
    setBusy(true);
    // Eigener Schlüssel je Scan: jedes Foto ist ein bewusstes Exemplar,
    // vorhandene Karten bekommen die Menge dazu.
    const ok = await fetch("/api/import/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchKey: crypto.randomUUID(),
        allowDuplicates: true,
        // Scryfall-ID = genau dieser Druck (Edition, Preis).
        items: [{ i: 0, name: match.name, scryfallId: match.id, quantity, foil }],
      }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        return ["imported", "updated"].includes(data.results?.[0]?.status);
      })
      .catch(() => false);
    setBusy(false);
    if (!ok) {
      setStatus("Speichern fehlgeschlagen – bitte erneut versuchen.");
      return;
    }
    setAdded((a) => [{ name: match.name, quantity, foil }, ...a]);
    setMatch(null);
    setRecognized("");
    setSuggestions([]);
    setStatus(`✓ ${quantity}× ${match.name}${foil ? " (Foil)" : ""} hinzugefügt – nächste Karte.`);
    router.refresh();
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-semibold">📷 Karten scannen</h1>

      {!cameraOn && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">
            Lege die <strong>ganze Karte</strong> in den Rahmen. Gelesen werden der Name oben und – bei Karten ab 2015 – die
            Infozeile unten links (Set und Nummer), damit der genaue Druck erkannt wird. Gutes Licht hilft.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={startCamera}
              className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-3 font-medium"
            >
              Kamera starten
            </button>
            <label className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-3 text-center font-medium cursor-pointer">
              Foto auswählen
              <input ref={fileRef} type="file" accept="image/*" onChange={scanFromFile} className="hidden" disabled={busy} />
            </label>
          </div>
          {cameraError && <p className="text-sm text-amber-400">{cameraError}</p>}
        </div>
      )}

      {cameraOn && (
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted className="w-full h-auto block" />
            {/* Kartenrahmen; Namensbalken und Infozeile hervorgehoben */}
            <div
              className="absolute border-2 border-emerald-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{ left: `${guide.x * 100}%`, top: `${guide.y * 100}%`, width: `${guide.w * 100}%`, height: `${guide.h * 100}%` }}
              aria-hidden
            >
              {[NAME_AREA, INFO_AREA].map((a, i) => (
                <div
                  key={i}
                  className="absolute border border-dashed border-emerald-200/80 rounded"
                  style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={scanFromCamera}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-3 font-medium disabled:opacity-50"
            >
              {busy ? "Lese…" : "Scannen"}
            </button>
            <button onClick={stopCamera} className="bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-3 text-sm">
              Kamera aus
            </button>
          </div>
        </div>
      )}

      {status && (
        <p className="text-sm text-zinc-300" aria-live="polite">
          {status}
        </p>
      )}

      {/* Name korrigieren / eintippen */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (recognized.trim().length >= 3) void resolve(recognized.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={recognized}
          onChange={(e) => setRecognized(e.target.value)}
          placeholder="Kartenname (deutsch oder englisch)"
          aria-label="Kartenname"
          className="flex-1 rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={busy || recognized.trim().length < 3}
          className="bg-zinc-700 hover:bg-zinc-600 rounded-md px-3 py-2 text-sm disabled:opacity-50"
        >
          Suchen
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500 self-center">Meintest du:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => void resolve(s)}
              className="rounded-full bg-zinc-800 hover:bg-zinc-700 px-3 py-1 text-xs"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Treffer bestätigen */}
      {match && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex gap-4">
          {match.imageUrl && (
            <Image src={match.imageUrl} alt={match.name} width={100} height={140} className="rounded-md self-start" />
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <p className="font-medium">{match.name}</p>
              <p className="text-xs text-zinc-500">{match.typeLine}</p>
              {match.set && (
                <p className={`text-xs ${match.exact ? "text-emerald-400" : "text-zinc-500"}`}>
                  {match.exact ? "✔ Druck erkannt: " : "Druck: "}
                  {match.setName ?? match.set.toUpperCase()} · #{match.collectorNumber}
                  {!match.exact && " (Standard – Infozeile nicht gelesen)"}
                </p>
              )}
              <p className="text-sm text-emerald-400">{formatEur(foil ? match.eurFoil ?? match.eur : match.eur)}</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center rounded-md border border-zinc-700" role="group" aria-label="Menge">
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-2.5 py-1" aria-label="weniger">
                  −
                </button>
                <span className="w-6 text-center tabular-nums">{quantity}</span>
                <button onClick={() => setQuantity((q) => q + 1)} className="px-2.5 py-1" aria-label="mehr">
                  +
                </button>
              </div>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
                Foil
              </label>
            </div>
            <div className="flex gap-3">
              <button
                onClick={confirmAdd}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-500 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
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
          <p className="mb-1">In dieser Sitzung hinzugefügt ({added.reduce((s, a) => s + a.quantity, 0)} Karten):</p>
          <ul className="space-y-0.5 text-zinc-500">
            {added.map((a, i) => (
              <li key={i}>
                {a.quantity}× {a.name}
                {a.foil ? " ✨" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
