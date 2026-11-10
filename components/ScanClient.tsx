"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Worker } from "tesseract.js";
import { getInfoWorker, getNameWorker, terminateAll, warmUp } from "@/lib/ocrEngine";
import { detectCard } from "@/lib/cardDetect";
import { pickBest, type CardHash } from "@/lib/imageHash";
import { grayOf, hashOf, printHash } from "@/lib/printHashClient";
import { loadPrints } from "@/components/ui/PrintPicker";import { formatEur } from "@/lib/format";
import { PrintPicker } from "@/components/ui/PrintPicker";
import { nameCandidates, parseCardInfo, preprocessPixels, type CardInfo, type OcrLine } from "@/lib/ocr";
import { coverGuide, fromVisible, visibleRegion, type Rect } from "@/lib/scanGeometry";
import { contrast, initialWatch, markScanned, toGray, watchFrame, WATCH, type WatchState } from "@/lib/frameWatch";
import {
  addScan,
  setQuantity,
  stackTotals,
  undoLast,
  unitPrice,
  updateItem,
  type ScanItem,
  type ScanMatch,
} from "@/lib/scanStack";

// Scanner im Stil von Sammel-Apps:
// - Vollbild-Kamera, Rahmen, Taschenlampe
// - Automatik: Karte hinlegen, kurz ruhig halten → wird erkannt (Ton +
//   Vibration) und landet auf dem Scan-Stapel; danach wartet der Scanner,
//   bis eine andere Karte im Rahmen liegt
// - Stapel: Menge, Foil, Druck ändern, rückgängig; überlebt Neuladen
// - Speichern in Sammlung, Wunschliste oder ein Deck – in Paketen, mit
//   Ladebalken und Wiederholung

// Bereiche relativ zur Karte: Namensbalken oben, Infozeile unten links
// (Sammlernummer, Set-Kürzel – auf Karten ab 2015).
const NAME_AREA = { x: 0.04, y: 0.02, w: 0.8, h: 0.09 };
const INFO_AREA = { x: 0.02, y: 0.91, w: 0.53, h: 0.08 };
const MIN_OCR_HEIGHT = 140;
const THUMB_W = 32;
const THUMB_H = 45;
const DETECT_W = 120; // Breite des Suchbilds für die Kartenkanten
const MAX_HASH_PRINTS = 40;

// Treffer und Bild-Fingerabdrücke je Sitzung merken (gleiche Karte erneut = sofort)
const resolveCache = new Map<string, ScanMatch | null>();

const STACK_KEY = "scan-stack-v1";
const PREFS_KEY = "scan-prefs-v1";

type Target = { kind: "collection" } | { kind: "wishlist" } | { kind: "deck"; deckId: string };
type Prefs = { auto: boolean; foil: boolean; sound: boolean; target: Target };
const DEFAULT_PREFS: Prefs = { auto: true, foil: false, sound: true, target: { kind: "collection" } };

function subArea(card: Rect, area: Rect, srcW: number, srcH: number) {
  return {
    sx: (card.x + area.x * card.w) * srcW,
    sy: (card.y + area.y * card.h) * srcH,
    sw: area.w * card.w * srcW,
    sh: area.h * card.h * srcH,
  };
}

// Bildausschnitt vergrößert und kontrastverstärkt für die Texterkennung.
function regionToCanvas(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number) {
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

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function loadStack(): ScanItem[] {
  try {
    const raw = window.localStorage.getItem(STACK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher gesperrt: gilt dann nur für diese Sitzung.
  }
}

// Kurzer Bestätigungston (ohne Audiodatei).
let audioCtx: AudioContext | null = null;
function beep(ok = true) {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = ok ? 1046 : 330;
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    // ohne Ton weiter
  }
}

export function ScanClient({ decks }: { decks: { id: string; name: string }[] }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // gefundene Karte im Bild (Video- und Bildschirmkoordinaten)
  const detectedRef = useRef<{ video: Rect; screen: Rect } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLCanvasElement | null>(null);
  const watchRef = useRef<WatchState>(initialWatch());
  const scanningRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [guide, setGuide] = useState<{ video: Rect; screen: Rect } | null>(null);
  const [detected, setDetected] = useState<Rect | null>(null); // Bildschirm, relativ
  const [toast, setToast] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null); // null = nicht verfügbar
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState<"ok" | "fail" | null>(null);
  const [manualName, setManualName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [stack, setStack] = useState<ScanItem[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // Aktuelle Einstellungen für die laufende Automatik (ohne Neustart der Schleife)
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [printFor, setPrintFor] = useState<string | null>(null); // Stapel-Schlüssel
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Stapel und Einstellungen laden / speichern
  useEffect(() => {
    setStack(loadStack());
    const p = load(PREFS_KEY, DEFAULT_PREFS);
    // Gelöschtes Deck als Ziel → zurück auf Sammlung
    if (p.target.kind === "deck" && !decks.some((d) => d.id === (p.target as { deckId: string }).deckId)) {
      p.target = { kind: "collection" };
    }
    setPrefs(p);
  }, [decks]);
  useEffect(() => save(STACK_KEY, stack), [stack]);
  useEffect(() => save(PREFS_KEY, prefs), [prefs]);

  // Aufräumen: Kamera aus, Texterkennung beenden.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void terminateAll();
    };
  }, []);

  const updateGuide = useCallback(() => {
    const video = videoRef.current;
    const view = viewRef.current;
    if (!video?.videoWidth || !view) return;
    setGuide(coverGuide(video.videoWidth, video.videoHeight, view.clientWidth, view.clientHeight));
  }, []);

  // Kamerastrom ans Video hängen, sobald das Element angezeigt wird.
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOn || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    video.onloadedmetadata = updateGuide;
    void video.play().catch(() => {});
    window.addEventListener("resize", updateGuide);
    return () => window.removeEventListener("resize", updateGuide);
  }, [cameraOn, updateGuide]);

  // Texterkennung vorladen (selbst ausgeliefert, zwei Worker parallel).
  async function prepareOcr() {
    setStatus("Lade Texterkennung (nur beim ersten Mal)…");
    try {
      await warmUp();
      setStatus(null);
    } catch {
      setStatus("Texterkennung konnte nicht geladen werden – Verbindung prüfen. Namen eintippen geht weiterhin.");
    }
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      watchRef.current = initialWatch();
      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setCameraOn(true);
      void prepareOcr();
    } catch {
      setCameraError("Kamera nicht verfügbar oder nicht erlaubt. Du kannst stattdessen ein Foto auswählen.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setTorch(null);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch == null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  async function ocrLines(canvas: HTMLCanvasElement, worker: Worker): Promise<OcrLine[]> {
    const { data } = await worker.recognize(canvas);
    const lines = (data.lines ?? []).map((l) => ({ text: l.text, confidence: l.confidence }));
    return lines.length ? lines : [{ text: data.text, confidence: data.confidence }];
  }

  // Name und Infozeile gleichzeitig lesen (zwei Worker).
  async function readCard(source: CanvasImageSource, card: Rect, w: number, h: number) {
    const n = subArea(card, NAME_AREA, w, h);
    const a = subArea(card, INFO_AREA, w, h);
    const nameCanvas = regionToCanvas(source, n.sx, n.sy, n.sw, n.sh);
    const infoCanvas = regionToCanvas(source, a.sx, a.sy, a.sw, a.sh);
    const [nameWorker, infoWorker] = await Promise.all([getNameWorker(), getInfoWorker()]);
    const [nameLines, infoLines] = await Promise.all([ocrLines(nameCanvas, nameWorker), ocrLines(infoCanvas, infoWorker)]);
    const info = parseCardInfo(infoLines.map((l) => l.text).join(" "));
    return { names: nameCandidates(nameLines), info: info.set || info.number ? info : null };
  }

  async function resolve(name: string, info: CardInfo | null, suggest: boolean): Promise<ScanMatch | null> {
    const params = new URLSearchParams({ name });
    if (info?.set && info.number) {
      params.set("set", info.set);
      params.set("number", info.number);
    }
    if (info?.lang) params.set("lang", info.lang);
    const cacheKey = params.toString();
    if (!suggest && resolveCache.has(cacheKey)) return resolveCache.get(cacheKey)!;
    if (!suggest) params.set("suggest", "0");
    const res = await fetch(`/api/scryfall/resolve?${params}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (suggest) setSuggestions(data?.suggestions ?? []);
    const match = res?.ok && data?.id ? (data as ScanMatch) : null;
    // Nur echte Antworten merken (nicht Netzfehler)
    if (res && (res.ok || res.status === 404)) resolveCache.set(cacheKey, match);
    return match;
  }

  // Kandidaten nacheinander prüfen, erster Treffer gewinnt.
  async function resolveCandidates(names: string[], info: CardInfo | null, suggest: boolean) {
    if (!names.length && !(info?.set && info?.number)) return { match: null, read: "" };
    for (const n of names.length ? names : [""]) {
      const match = await resolve(n, info, suggest);
      if (match) return { match, read: n };
    }
    return { match: null, read: names[0] ?? "" };
  }

  function accept(match: ScanMatch, foil = prefsRef.current.foil, camHash?: CardHash) {
    // Fingerabdruck nur merken, wenn der Druck nicht sicher ist (spart Speicher)
    const keep = !match.exact && camHash ? Array.from(camHash) : undefined;
    setStack((s) => addScan(s, match, foil, Date.now(), keep));
    setSuggestions([]);
    setManualName("");
    setStatus(null);
    setFlash("ok");
    setTimeout(() => setFlash(null), 450);
    if (prefsRef.current.sound) beep(true);
    navigator.vibrate?.(40);
  }

  // Druck per Bildvergleich bestimmen, wenn Set/Nummer nicht lesbar waren:
  // Fingerabdruck der Kamera gegen die Drucke dieser Karte (neueste zuerst).
  async function refinePrint(match: ScanMatch, foil: boolean, camHash: CardHash) {
    try {
      const prints = (await loadPrints(match.name)).slice(0, MAX_HASH_PRINTS);
      if (prints.length < 2) return;
      const hashed: Array<(typeof prints)[number] & { hash: CardHash }> = [];
      for (const p of prints) {
        const h = await printHash(p.id, p.imageUrl);
        if (h) hashed.push({ ...p, hash: h });
      }
      const best = pickBest(camHash, hashed);
      if (!best || best.best.id === match.id) return;
      const key = `${match.id}|${foil ? 1 : 0}`;
      setStack((s) => {
        const item = s.find((x) => x.key === key);
        // nur frisch gescannte Einzelkarte umstellen, nie vorhandene Mengen
        return item && item.quantity === 1 ? updateItem(s, key, { print: { ...best.best, exact: true } }) : s;
      });
      setToast(`Druck per Bild erkannt: ${best.best.setName ?? best.best.set?.toUpperCase()}`);
      setTimeout(() => setToast(null), 2500);
    } catch {
      // Bildvergleich ist eine Zugabe – ohne ihn bleibt der Standarddruck
    }
  }

  // Bild aus dem Rahmen lesen. `auto`: aus der Automatik ausgelöst.
  async function scanFrame(auto: boolean): Promise<boolean> {
    const video = videoRef.current;
    if (!video?.videoWidth || !guide || scanningRef.current) return false;
    scanningRef.current = true;
    setScanning(true);
    try {
      const W = video.videoWidth;
      const H = video.videoHeight;
      // Gefundene Karte bevorzugen, sonst den festen Rahmen
      const card = detectedRef.current?.video ?? guide.video;
      // Bild der Karte sofort festhalten (für den Bildvergleich der Drucke)
      const camHash = hashOf(video, card.x * W, card.y * H, card.w * W, card.h * H);
      const { names, info } = await readCard(video, card, W, H);
      const { match, read } = await resolveCandidates(names, info, !auto);
      if (match) {
        accept(match, prefsRef.current.foil, camHash);
        if (!match.exact) void refinePrint(match, prefsRef.current.foil, camHash);
        return true;
      }
      if (!auto) {
        setManualName(read);
        setStatus(read ? `Keine Karte für „${read}“ gefunden – Namen korrigieren oder Vorschlag antippen.` : "Kein Name erkannt – Karte gerade in den Rahmen legen.");
        if (prefsRef.current.sound) beep(false);
      }
      return false;
    } catch {
      if (!auto) setStatus("Lesen fehlgeschlagen – bitte erneut versuchen.");
      return false;
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }

  // Automatik: kleine Vorschaubilder vergleichen, bei ruhigem Bild mit Karte lesen.
  useEffect(() => {
    if (!cameraOn || !prefs.auto || !guide) return;
    let stopped = false;
    let misses = 0;
    thumbRef.current ??= document.createElement("canvas");
    const thumb = thumbRef.current;
    thumb.width = THUMB_W;
    thumb.height = THUMB_H;
    const ctx = thumb.getContext("2d", { willReadFrequently: true })!;

    async function tick() {
      if (stopped) return;
      const video = videoRef.current;
      const view = viewRef.current;
      if (video?.videoWidth && view && !scanningRef.current && !printFor && !sheetOpen) {
        // 1) Karte im sichtbaren Bild suchen
        const vis = visibleRegion(video.videoWidth, video.videoHeight, view.clientWidth, view.clientHeight);
        const dw = DETECT_W;
        const dh = Math.round((DETECT_W * vis.h * video.videoHeight) / (vis.w * video.videoWidth));
        const found = detectCard(
          grayOf(video, vis.x * video.videoWidth, vis.y * video.videoHeight, vis.w * video.videoWidth, vis.h * video.videoHeight, dw, dh),
          dw,
          dh,
        );
        detectedRef.current = found ? { video: fromVisible(found, vis), screen: found } : null;
        setDetected(found);
        // 2) Ruhe-/Wechselprüfung auf dem ganzen sichtbaren Bild – das wackelt
        //    nicht mit dem erkannten Kartenrahmen (sonst würde dieselbe Karte
        //    mehrfach gezählt). Karte vorhanden: erkannt oder genug Kontrast
        //    im Hilfsrahmen.
        ctx.drawImage(
          video,
          vis.x * video.videoWidth,
          vis.y * video.videoHeight,
          vis.w * video.videoWidth,
          vis.h * video.videoHeight,
          0,
          0,
          THUMB_W,
          THUMB_H,
        );
        const frame = toGray(ctx.getImageData(0, 0, THUMB_W, THUMB_H).data);
        const gv = guide!.video;
        const guideContrast = contrast(
          grayOf(video, gv.x * video.videoWidth, gv.y * video.videoHeight, gv.w * video.videoWidth, gv.h * video.videoHeight, 24, 34),
        );
        // Ersatz, falls die Kanten nicht erkannt werden (z. B. weiße Karte auf
        // hellem Tisch): sehr kontrastreicher Inhalt im Hilfsrahmen. Doppelte
        // Schwelle, damit gemusterte Tische nicht als Karte gelten.
        const present = Boolean(found) || guideContrast >= WATCH.minContrast * 2;
        const r = watchFrame(watchRef.current, frame, present);
        watchRef.current = r.state;
        if (r.shouldScan) {
          const ok = await scanFrame(true);
          if (ok) {
            misses = 0;
            watchRef.current = markScanned(watchRef.current, frame);
          } else if (++misses >= 2) {
            // Zweimal nichts erkannt: nicht endlos weiterlesen – Hinweis zeigen
            // und erst nach Kartenwechsel wieder versuchen.
            misses = 0;
            watchRef.current = markScanned(watchRef.current, frame);
            setStatus("Nicht erkannt – Karte ausrichten, Licht verbessern oder Auslöser/Namen nutzen.");
            if (prefsRef.current.sound) beep(false);
          }
        }
      }
      if (!stopped) setTimeout(tick, 300);
    }
    const t = setTimeout(tick, 500);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
    // scanFrame/prefs absichtlich aus dem Abschluss: Neustart nur bei Kamera/Rahmen/Modus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, prefs.auto, guide, printFor, sheetOpen]);

  // Foto/Galerie
  async function scanFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setScanning(true);
    setStatus("Lese Foto…");
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, 1600 / bitmap.width);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      const full = document.createElement("canvas");
      full.width = w;
      full.height = h;
      full.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
      // Karte im Foto suchen; sonst ganzes Foto (wenn im Kartenformat) bzw.
      // obere Hälfte zeilenweise
      const dh = Math.round((DETECT_W * h) / w);
      const found = detectCard(grayOf(full, 0, 0, w, h, DETECT_W, dh), DETECT_W, dh);
      const ratio = w / h;
      let result;
      const card: Rect | null = found ?? (ratio > 0.62 && ratio < 0.82 ? { x: 0, y: 0, w: 1, h: 1 } : null);
      if (card) {
        const { names, info } = await readCard(full, card, w, h);
        result = await resolveCandidates(names, info, true);
      } else {
        const lines = await ocrLines(regionToCanvas(full, 0, 0, w, h * 0.5), await getNameWorker());
        result = await resolveCandidates(nameCandidates(lines, 4), null, true);
      }
      if (result.match) accept(result.match);
      else {
        setManualName(result.read);
        setStatus("Nicht erkannt – Namen korrigieren oder Vorschlag antippen.");
      }
    } catch {
      setStatus("Bild konnte nicht gelesen werden – bitte Namen eintippen.");
    } finally {
      setScanning(false);
    }
  }

  async function searchManual(name: string) {
    if (name.trim().length < 3) return;
    setScanning(true);
    setStatus(`Suche „${name}“…`);
    const match = await resolve(name.trim(), null, true);
    setScanning(false);
    if (match) accept(match);
    else setStatus(`Keine Karte für „${name}“ gefunden.`);
  }

  // Speichern: in Paketen, mit Wiederholung bei Netz-/Scryfall-Fehlern.
  async function saveStack() {
    if (!stack.length || saving) return;
    const target = prefs.target;
    const items = [...stack].reverse(); // in Scan-Reihenfolge
    const total = items.reduce((n, s) => n + s.quantity, 0);
    setSaving({ done: 0, total });
    setSaveMsg(null);
    const saved = new Set<string>();
    let failed = 0;

    async function post(url: string, body: unknown): Promise<boolean> {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.ok) return true;
          if (res.status !== 503 && res.status < 500) return false;
        } catch {
          // Netzwerkfehler: bei Sammlung/Wunschliste gefahrlos wiederholbar
          if (target.kind === "deck") return false;
        }
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
      return false;
    }

    if (target.kind === "deck") {
      const ok = await post(`/api/decks/${target.deckId}/cards`, {
        entries: items.map((s) => ({ name: s.name, scryfallId: s.id, quantity: s.quantity, foil: s.foil })),
      });
      if (ok) items.forEach((s) => saved.add(s.key));
      else failed = items.length;
      setSaving({ done: total, total });
    } else {
      let done = 0;
      for (let start = 0; start < items.length; start += 50) {
        const chunk = items.slice(start, start + 50);
        const body = {
          // fester Schlüssel je Paket → Wiederholen bucht nicht doppelt
          batchKey: crypto.randomUUID(),
          allowDuplicates: true,
          items: chunk.map((s, i) => ({ i, name: s.name, scryfallId: s.id, quantity: s.quantity, foil: s.foil })),
        };
        const ok = await post(target.kind === "collection" ? "/api/import/batch" : "/api/wishlist/import", body);
        if (ok) chunk.forEach((s) => saved.add(s.key));
        else failed += chunk.length;
        done += chunk.reduce((n, s) => n + s.quantity, 0);
        setSaving({ done, total });
      }
    }

    const savedCards = items.filter((s) => saved.has(s.key)).reduce((n, s) => n + s.quantity, 0);
    setStack((s) => s.filter((x) => !saved.has(x.key)));
    setSaving(null);
    const where =
      target.kind === "collection" ? "in der Sammlung" : target.kind === "wishlist" ? "auf der Wunschliste" : `im Deck „${decks.find((d) => d.id === target.deckId)?.name ?? ""}“`;
    setSaveMsg(
      failed
        ? `${savedCards} Karten ${where} gespeichert, ${failed} Einträge nicht – sie bleiben im Stapel, bitte erneut speichern.`
        : `✓ ${savedCards} Karten ${where} gespeichert.`,
    );
    router.refresh();
  }

  const totals = stackTotals(stack);
  const last = stack[0];
  const targetLabel =
    prefs.target.kind === "collection"
      ? "Sammlung"
      : prefs.target.kind === "wishlist"
        ? "Wunschliste"
        : `Deck: ${decks.find((d) => d.id === (prefs.target as { deckId: string }).deckId)?.name ?? "?"}`;
  const targetValue = prefs.target.kind === "deck" ? `deck:${prefs.target.deckId}` : prefs.target.kind;
  const setTarget = (v: string) =>
    setPrefs((p) => ({
      ...p,
      target: v.startsWith("deck:") ? { kind: "deck", deckId: v.slice(5) } : { kind: v as "collection" | "wishlist" },
    }));

  const targetSelect = (
    <label className="relative inline-flex">
      <span className="sr-only">Speichern in</span>
      <select
        value={targetValue}
        onChange={(e) => setTarget(e.target.value)}
        className="appearance-none rounded-full bg-black/50 backdrop-blur border border-white/15 pl-3 pr-7 h-9 text-sm text-white outline-none max-w-[13rem] truncate"
      >
        <option value="collection">→ Sammlung</option>
        <option value="wishlist">→ Wunschliste</option>
        {decks.map((d) => (
          <option key={d.id} value={`deck:${d.id}`}>
            → Deck: {d.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">▼</span>
    </label>
  );

  const stackSheet = (
    <StackList
      stack={stack}
      onQty={(k, q) => setStack((s) => setQuantity(s, k, q))}
      onFoil={(k, f) => setStack((s) => updateItem(s, k, { foil: f }))}
      onPrints={(item) => setPrintFor(item.key)}
    />
  );

  const saveBar = (
    <div className="space-y-2">
      {saving && (
        <div className="space-y-1" aria-live="polite">
          <div className="h-3 rounded-full bg-zinc-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round((saving.done / saving.total) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(saving.done / saving.total) * 100}%` }} />
          </div>
          <p className="text-xs text-zinc-400 tabular-nums">
            {saving.done} von {saving.total} Karten gespeichert …
          </p>
        </div>
      )}
      <button
        onClick={saveStack}
        disabled={!stack.length || !!saving}
        className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-3 disabled:opacity-40"
      >
        {saving ? "Speichere…" : `${totals.cards} Karten in ${targetLabel} speichern`}
      </button>
    </div>
  );

  return (
    <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Karten scannen</h1>
        <p className="text-sm text-zinc-400">
          Karte ins Bild legen und kurz ruhig halten – sie wird automatisch gefunden und erkannt (Name, Set, Nummer,
          bei Bedarf der Druck per Bildvergleich) und landet auf dem Stapel. Danach einfach die nächste Karte hinlegen.
          Deutsche und englische Karten.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={startCamera} className="rounded-xl bg-indigo-500 hover:bg-indigo-400 px-3 py-4 font-semibold">
          📷 Scanner starten
        </button>
        <label className="rounded-xl bg-white/5 border border-white/10 hover:border-white/20 px-3 py-4 text-center font-medium cursor-pointer">
          Foto auswählen
          <input ref={fileRef} type="file" accept="image/*" onChange={scanFromFile} className="hidden" disabled={scanning} />
        </label>
      </div>
      {cameraError && <p className="text-sm text-amber-400">{cameraError}</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-400">Speichern in</span>
        {targetSelect}
      </div>

      {!cameraOn && status && (
        <p className="text-sm text-zinc-300" aria-live="polite">
          {status}
        </p>
      )}
      {!cameraOn && (
        <ManualSearch
          value={manualName}
          onChange={setManualName}
          onSearch={searchManual}
          busy={scanning}
          suggestions={suggestions}
          onSuggestion={searchManual}
        />
      )}

      {saveMsg && <p className="text-sm text-emerald-300" aria-live="polite">{saveMsg}</p>}

      {stack.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">
              Scan-Stapel <span className="text-sm text-zinc-500">{totals.cards} Karten</span>
            </h2>
            <span className="text-sm font-semibold text-emerald-400 tabular-nums">{formatEur(totals.value)}</span>
          </div>
          {stackSheet}
          {saveBar}
          <button
            onClick={() => confirm("Stapel wirklich leeren? Nicht gespeicherte Scans gehen verloren.") && setStack([])}
            className="w-full text-sm text-zinc-500 hover:text-red-400 py-1"
          >
            Stapel leeren
          </button>
        </section>
      )}

      {/* Vollbild-Scanner */}
      {cameraOn && (
        <div className="fixed inset-0 z-[55] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Scanner">
          <div ref={viewRef} className="relative flex-1 overflow-hidden">
            <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />

            {guide && (() => {
              // Gefundene Karte hervorheben, sonst den Rahmen als Hilfe zeigen
              const r = detected ?? guide.screen;
              return (
                <div
                  className={`absolute rounded-[4.75%/3.5%] transition-all duration-150 ${
                    detected ? "border-[3px]" : "border-2 border-dashed"
                  } ${
                    flash === "ok"
                      ? "border-emerald-400"
                      : scanning
                        ? "border-indigo-400 animate-pulse"
                        : detected
                          ? "border-sky-300"
                          : "border-white/70"
                  } ${detected ? "" : "shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"}`}
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                  aria-hidden
                >
                  {!detected &&
                    [NAME_AREA, INFO_AREA].map((a, i) => (
                      <div
                        key={i}
                        className="absolute border border-dashed border-white/40 rounded"
                        style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` }}
                      />
                    ))}
                  {flash === "ok" && (
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="grid place-items-center w-16 h-16 rounded-full bg-emerald-500 text-3xl text-white shadow-xl">✓</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Kopfleiste */}
            <div className="absolute top-0 inset-x-0 flex items-center justify-between gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
              <button
                onClick={stopCamera}
                aria-label="Scanner schließen"
                className="grid place-items-center w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white text-lg"
              >
                ✕
              </button>
              {targetSelect}
              {torch != null ? (
                <button
                  onClick={toggleTorch}
                  aria-pressed={torch}
                  aria-label="Taschenlampe"
                  className={`grid place-items-center w-10 h-10 rounded-full backdrop-blur text-lg ${torch ? "bg-amber-300 text-zinc-900" : "bg-black/50 text-white"}`}
                >
                  ϟ
                </button>
              ) : (
                <span className="w-10" />
              )}
            </div>

            {/* Statuszeile über dem unteren Bereich */}
            <div className="absolute bottom-2 inset-x-0 px-3 flex flex-col items-center gap-2">
              {toast && (
                <p className="max-w-sm text-center text-xs text-zinc-900 bg-emerald-300 rounded-full px-3 py-1.5" aria-live="polite">
                  {toast}
                </p>
              )}
              {(status || scanning) && (
                <p className="max-w-sm text-center text-xs text-white bg-black/60 backdrop-blur rounded-full px-3 py-1.5" aria-live="polite">
                  {scanning ? "Lese Karte…" : status}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Toggle on={prefs.auto} onClick={() => setPrefs((p) => ({ ...p, auto: !p.auto }))} label="Auto" />
                <Toggle on={prefs.foil} onClick={() => setPrefs((p) => ({ ...p, foil: !p.foil }))} label="Foil" />
                <Toggle on={prefs.sound} onClick={() => setPrefs((p) => ({ ...p, sound: !p.sound }))} label="Ton" />
              </div>
            </div>
          </div>

          {/* Unterer Bereich: letzte Karte, Auslöser, Stapel */}
          <div className="bg-zinc-950 border-t border-white/10 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-3">
            {last ? (
              <div className="flex items-center gap-3">
                <span className="relative shrink-0 w-11 h-[61px] rounded-[4px] overflow-hidden bg-zinc-800">
                  {last.imageUrl && <Image src={last.imageUrl} alt="" width={44} height={61} className="w-full h-full object-cover" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {last.quantity > 1 && <span className="text-zinc-400">{last.quantity}× </span>}
                    {last.name}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    <span className="uppercase">{last.set}</span> #{last.collectorNumber}
                    {last.exact ? "" : " · Druck geschätzt"}
                    {last.foil && <span className="text-fuchsia-300"> · Foil</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold text-emerald-400 tabular-nums">{formatEur(unitPrice(last))}</span>
                <button
                  onClick={() => setStack((s) => undoLast(s))}
                  className="shrink-0 rounded-full bg-white/10 px-3 h-9 text-xs"
                >
                  Rückgängig
                </button>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-3">Noch keine Karte gescannt.</p>
            )}

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <button
                onClick={() => setSheetOpen(true)}
                className="justify-self-start text-left rounded-xl bg-white/5 px-3 py-2"
              >
                <span className="block text-sm font-semibold tabular-nums">{totals.cards} Karten</span>
                <span className="block text-xs text-emerald-400 tabular-nums">{formatEur(totals.value)}</span>
              </button>
              <button
                onClick={() => void scanFrame(false)}
                disabled={scanning}
                aria-label="Jetzt scannen"
                className="grid place-items-center w-16 h-16 rounded-full bg-white ring-4 ring-white/30 disabled:opacity-60"
              >
                <span className={`w-12 h-12 rounded-full ${scanning ? "bg-indigo-400 animate-pulse" : "bg-white border-2 border-zinc-900"}`} />
              </button>
              <button
                onClick={() => setSheetOpen(true)}
                disabled={!stack.length}
                className="justify-self-end rounded-xl bg-emerald-500 text-zinc-950 font-semibold px-4 py-2.5 text-sm disabled:opacity-40"
              >
                Fertig
              </button>
            </div>
          </div>

          {/* Stapel als Blatt über dem Scanner */}
          {sheetOpen && (
            <div className="absolute inset-0 z-10 flex items-end bg-black/60" onClick={() => setSheetOpen(false)}>
              <div
                className="w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-zinc-900 border-t border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 animate-[sheet_200ms_ease-out]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mx-auto h-1 w-10 rounded-full bg-zinc-700" aria-hidden />
                <div className="flex items-baseline justify-between">
                  <h2 className="font-semibold">
                    Scan-Stapel <span className="text-sm text-zinc-500">{totals.cards} Karten</span>
                  </h2>
                  <span className="text-sm font-semibold text-emerald-400 tabular-nums">{formatEur(totals.value)}</span>
                </div>
                <ManualSearch
                  value={manualName}
                  onChange={setManualName}
                  onSearch={searchManual}
                  busy={scanning}
                  suggestions={suggestions}
                  onSuggestion={searchManual}
                />
                {stack.length ? stackSheet : <p className="text-sm text-zinc-500">Noch leer.</p>}
                {saveMsg && <p className="text-sm text-emerald-300">{saveMsg}</p>}
                {saveBar}
                <button onClick={() => setSheetOpen(false)} className="w-full text-sm text-zinc-400 py-1">
                  Weiter scannen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Druck auswählen */}
      {printFor && stack.find((x) => x.key === printFor) && (
        <PrintPicker
          name={stack.find((x) => x.key === printFor)!.name}
          currentId={stack.find((x) => x.key === printFor)!.id}
          reference={(() => {
            const h = stack.find((x) => x.key === printFor)!.camHash;
            return h ? Uint8Array.from(h) : undefined;
          })()}
          onPick={(p) => {
            setStack((s) => updateItem(s, printFor, { print: p }));
            setPrintFor(null);
          }}
          onClose={() => setPrintFor(null)}
        />
      )}
    </main>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 h-8 text-xs font-medium backdrop-blur border ${
        on ? "bg-white text-zinc-900 border-white" : "bg-black/50 text-white border-white/20"
      }`}
    >
      {label}
    </button>
  );
}

function ManualSearch({
  value,
  onChange,
  onSearch,
  busy,
  suggestions,
  onSuggestion,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (v: string) => void;
  busy: boolean;
  suggestions: string[];
  onSuggestion: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(value);
        }}
        className="flex gap-2"
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Kartenname eintippen (deutsch oder englisch)"
          aria-label="Kartenname"
          className="flex-1 min-w-0 h-11 rounded-xl bg-white/5 border border-white/10 px-3 outline-none focus:border-indigo-400/70"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length < 3}
          className="rounded-xl bg-white/10 hover:bg-white/15 px-4 text-sm disabled:opacity-40"
        >
          Hinzufügen
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500 self-center">Meintest du:</span>
          {suggestions.map((s) => (
            <button key={s} onClick={() => onSuggestion(s)} className="rounded-full bg-white/10 hover:bg-white/15 px-3 py-1 text-xs">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StackList({
  stack,
  onQty,
  onFoil,
  onPrints,
}: {
  stack: ScanItem[];
  onQty: (key: string, q: number) => void;
  onFoil: (key: string, foil: boolean) => void;
  onPrints: (item: ScanItem) => void;
}) {
  return (
    <ul className="rounded-xl border border-white/10 bg-zinc-900/60 divide-y divide-white/5 overflow-hidden">
      {stack.map((s) => (
        <li key={s.key} className="flex items-center gap-3 px-3 py-2">
          <button onClick={() => onPrints(s)} className="relative shrink-0 w-10 h-14 rounded-[4px] overflow-hidden bg-zinc-800" aria-label={`Druck von ${s.name} ändern`}>
            {s.imageUrl && <Image src={s.imageUrl} alt="" width={40} height={56} className="w-full h-full object-cover" />}
            {s.foil && <span className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/30 via-transparent to-cyan-300/30" aria-hidden />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{s.name}</p>
            <button onClick={() => onPrints(s)} className="text-xs text-zinc-500 hover:text-zinc-300 truncate max-w-full text-left">
              <span className="uppercase">{s.set}</span> #{s.collectorNumber} ·{" "}
              {s.exact ? (
                "Druck ändern"
              ) : (
                // Set/Nummer nicht gelesen und Bildvergleich nicht eindeutig
                <span className="rounded-full bg-amber-400/15 text-amber-300 px-1.5">Druck prüfen</span>
              )}
            </button>
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => onFoil(s.key, !s.foil)}
                aria-pressed={s.foil}
                className={`rounded-full px-2 h-6 text-[11px] border ${s.foil ? "bg-fuchsia-500/20 border-fuchsia-400/60 text-fuchsia-200" : "border-white/10 text-zinc-400"}`}
              >
                Foil
              </button>
              <span className="text-xs text-emerald-400 tabular-nums">{formatEur(unitPrice(s))}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-black/30 p-1">
            <button onClick={() => onQty(s.key, s.quantity - 1)} aria-label={`${s.name} weniger`} className="w-7 h-7 rounded-full bg-white/10">
              −
            </button>
            <span className="w-6 text-center text-sm tabular-nums">{s.quantity}</span>
            <button onClick={() => onQty(s.key, s.quantity + 1)} aria-label={`${s.name} mehr`} className="w-7 h-7 rounded-full bg-white/10">
              +
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
