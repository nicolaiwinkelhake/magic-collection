"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WishlistCleanup } from "@/components/WishlistCleanup";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Worker } from "tesseract.js";
import { getGermanWorker, getNameWorker, NAME_PSM, terminateAll, warmUp } from "@/lib/ocrEngine";
import { detectCard } from "@/lib/cardDetect";
import { DETECT_W, INFO_AREA, NAME_AREA, ocrLines, rectToQuad, regionToCanvas } from "@/lib/scanRead";
import { bestGuess, recognizeFrame } from "@/lib/scanRecognize";
import { buzz } from "@/lib/haptics";
import { quadBounds } from "@/lib/cardQuad";
import { listVerdict, readRegion, referenceStrip, type SearchRegion } from "@/lib/listIcon";
import { loadSetPrior, setPriorIfReady } from "@/lib/setPriorClient";
import { germanIndexIfReady, loadGermanIndex } from "@/lib/germanIndexClient";
import { type CardHash } from "@/lib/imageHash";
import { choosePrint, narrowPrints } from "@/lib/printChoice";
import { grayOf, hashOf, printHash } from "@/lib/printHashClient";
import { loadPrints } from "@/components/ui/PrintPicker";
import { directByName, directExact, directPrint } from "@/lib/scryfallDirect";
import { loadNameIndex, nameIndexIfReady } from "@/lib/nameIndexClient";
import { formatEur } from "@/lib/format";
import { PrintPicker } from "@/components/ui/PrintPicker";
import { SelectCheck, SelectionBar } from "@/components/ui/SelectionBar";
import { toggle, toggleAll } from "@/lib/selection";
import { nameCandidates, type CardInfo } from "@/lib/ocr";
import { coverGuide, fromVisible, visibleRegion, type Rect } from "@/lib/scanGeometry";
import { contrast, initialWatch, markScanned, toGray, watchFrame, WATCH, type WatchState } from "@/lib/frameWatch";
import { nextTickMs, sameRect } from "@/lib/scanPace";
import { confirmDim, DIM_LEVEL, mean, type Pending } from "@/lib/scanLight";
import {
  addPending,
  addScan,
  failPending,
  pendingKey,
  scanKey,
  resolvePending,
  setQuantity,
  unresolved,
  stackTotals,
  undoLast,
  isRepeatOfLast,
  setAlternative,
  swapAlternative,
  unitPrice,
  updateItem,
  type ScanItem,
  type ScanMatch,
} from "@/lib/scanStack";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardSearch } from "@/components/CardSearch";
import { cardCrop, printInfo, rememberAttempt, reportScan, type Attempt, type ReportKind } from "@/lib/scanReports";

// Scanner im Stil von Sammel-Apps:
// - Vollbild-Kamera, Rahmen, Taschenlampe
// - Automatik: Karte hinlegen, kurz ruhig halten → wird erkannt (Ton +
//   Vibration) und landet auf dem Scan-Stapel; danach wartet der Scanner,
//   bis eine andere Karte im Rahmen liegt
// - Tempo: Kartennamen-Wörterbuch auf dem Gerät korrigiert Lesefehler sofort;
//   ist der Name sicher, wird ohne Warten aufs Netz bestätigt – Druck und
//   Preis kommen im Hintergrund nach, während die nächste Karte schon liegt
// - Stapel: Menge, Foil, Druck ändern, rückgängig; überlebt Neuladen
// - Speichern in Sammlung, Wunschliste oder ein Deck – in Paketen, mit
//   Ladebalken und Wiederholung

// Automatik: so oft wird das Kamerabild geprüft, und so viele Leseversuche
// gibt es je Karte, bevor der Scanner bis zum Kartenwechsel pausiert.
// Schnell auslösen: lieber ein Versuch mehr als warten.
const MAX_MISSES = 4;
const THUMB_W = 32;
const THUMB_H = 45;
const MAX_HASH_PRINTS = 40;

// Treffer und Bild-Fingerabdrücke je Sitzung merken (gleiche Karte erneut = sofort)
const resolveCache = new Map<string, ScanMatch | null>();

const STACK_KEY = "scan-stack-v1";
const PREFS_KEY = "scan-prefs-v1";

type Target = { kind: "collection"; folderId?: string | null } | { kind: "wishlist" } | { kind: "deck"; deckId: string };
type Prefs = { auto: boolean; foil: boolean; sound: boolean; german: boolean; target: Target; /** Fehlschläge zum Verbessern speichern */ learn?: boolean };
const DEFAULT_PREFS: Prefs = { auto: true, foil: false, sound: true, german: false, target: { kind: "collection" }, learn: false };

// Zeitmessung für die Optimierung: nur aktiv mit localStorage "scan-debug" = "1"
let debugT0 = 0;
function scanLog(event: string, reset = false) {
  try {
    if (window.localStorage.getItem("scan-debug") !== "1") return;
  } catch {
    return;
  }
  const now = performance.now();
  if (reset) debugT0 = now;
  console.log(`TIMING ${event} ${Math.round(now - debugT0)}`);
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

export function ScanClient({
  decks,
  folders = [],
}: {
  decks: { id: string; name: string }[];
  /** eigene Ordner der Sammlung (Migration 014) */
  folders?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // gefundene Karte im Bild (Video- und Bildschirmkoordinaten)
  const detectedRef = useRef<{ video: Rect; screen: Rect } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLCanvasElement | null>(null);
  const watchRef = useRef<WatchState>(initialWatch());
  // Helligkeit im Rahmen (Automatik misst laufend); wenig Licht → strenger annehmen
  const lightRef = useRef(255);
  const [dim, setDim] = useState(false);
  // nach dem Speichern in die Sammlung: gleiche Karten auf der Wunschliste? → fragen
  const [cleanupNames, setCleanupNames] = useState<string[] | null>(null);
  const confirmRef = useRef<Pending>(null);
  const scanningRef = useRef(false);
  // Standbild fürs Lesen (gelesen wird in mehreren Schritten, das Video läuft weiter)
  const snapRef = useRef<HTMLCanvasElement | null>(null);

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
  // Für die Automatik: aktueller Stapel (in laufenden Scans) und ob dieselbe Karte erneut zählen darf
  const stackRef = useRef<ScanItem[]>([]);
  stackRef.current = stack;
  const repeatOkRef = useRef(false);
  // Einträge, für die „The List“ schon geprüft wurde (nicht bei jeder Wiederholung erneut)
  const listCheckedRef = useRef(new Set<string>());
  // „Scanner verbessern“: letzter Leseversuch und Versuche je Stapel-Eintrag (nur wenn eingeschaltet)
  const lastAttemptRef = useRef<Attempt | null>(null);
  const attemptsRef = useRef(new Map<string, Attempt>());
  function learnFix(kind: ReportKind, key: string, from: ScanMatch, to: ScanMatch) {
    if (!prefsRef.current.learn) return;
    const att = attemptsRef.current.get(key);
    if (!att) return; // nur gescannte Karten, nicht von Hand hinzugefügte
    void reportScan(kind, { read: att.read, scanned: printInfo(from), corrected: printInfo(to), image: att.image });
  }
  const [loaded, setLoaded] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // Aktuelle Einstellungen für die laufende Automatik (ohne Neustart der Schleife)
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [printFor, setPrintFor] = useState<string | null>(null); // Stapel-Schlüssel
  // Mehrfachauswahl im Scan-Stapel
  const [stackSelect, setStackSelect] = useState(false);
  const [stackSelected, setStackSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Stapel und Einstellungen laden / speichern
  useEffect(() => {
    const restored = loadStack();
    setStack(restored);
    setLoaded(true);
    // Nach Neuladen: offene Einträge erneut nachschlagen
    for (const item of restored.filter((x) => x.pending)) void finishPending(item.key, item.name, null, [], null, item.foil);
    const p = load(PREFS_KEY, DEFAULT_PREFS);
    // Gelöschtes Deck als Ziel → zurück auf Sammlung
    // Gelöschter Ordner als Ziel → Sammlung ohne Ordner
    if (p.target.kind === "collection" && p.target.folderId && !folders.some((f) => f.id === (p.target as { folderId?: string }).folderId)) {
      p.target = { kind: "collection" };
    }
    if (p.target.kind === "deck" && !decks.some((d) => d.id === (p.target as { deckId: string }).deckId)) {
      p.target = { kind: "collection" };
    }
    setPrefs(p);
  }, [decks, folders]);
  // Erst speichern, wenn geladen wurde – sonst überschreibt der leere
  // Anfangszustand den gespeicherten Stapel (z. B. bei doppeltem Rendern).
  useEffect(() => {
    if (loaded) save(STACK_KEY, stack);
    // "Einen Moment – lädt noch" erledigt sich, sobald alles geladen ist
    if (!unresolved(stack).pending) setSaveMsg((m) => (m?.startsWith("Einen Moment") ? null : m));
  }, [stack, loaded]);
  useEffect(() => {
    if (loaded) save(PREFS_KEY, prefs);
  }, [prefs, loaded]);

  // Texterkennung schon beim Öffnen der Seite im Hintergrund laden – dann ist
  // sie bereit, wenn die Kamera startet.
  useEffect(() => {
    const t = setTimeout(() => void warmUp().catch(() => {}), 800);
    // Wörterbuch im Leerlauf vorbereiten (einmal laden, danach vom Gerät)
    const d = setTimeout(() => {
      void loadNameIndex();
      void loadSetPrior();
      void loadGermanIndex();
    }, 1500);
    // Verbindung zu Scryfall schon aufbauen – spart beim ersten Scan den Handshake
    for (const href of ["https://api.scryfall.com", "https://cards.scryfall.io"]) {
      if (!document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) {
        const link = document.createElement("link");
        link.rel = "preconnect";
        link.href = href;
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
      }
    }
    return () => {
      clearTimeout(t);
      clearTimeout(d);
    };
  }, []);

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
      if (prefsRef.current.german) await getGermanWorker();
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

  async function resolve(name: string, info: CardInfo | null, suggest: boolean): Promise<ScanMatch | null> {
    const params = new URLSearchParams({ name });
    if (info?.set && info.number) {
      params.set("set", info.set);
      params.set("number", info.number);
    }
    if (info?.lang) params.set("lang", info.lang);
    const cacheKey = params.toString();
    if (resolveCache.get(cacheKey)) return resolveCache.get(cacheKey)!;
    // Schneller Weg: direkt bei Scryfall (eine Anfrage, kein Server-Umweg).
    // Der Server (mit Varianten, deutschen Namen, Vorschlägen) nur, wenn das
    // nichts findet.
    const direct =
      info?.set && info.number
        ? await directPrint(info.set, info.number, info.lang, name ? [name] : [])
        : name && info?.lang !== "DE"
          ? await directByName(name)
          : null; // deutscher Name: nicht unscharf unter den englischen suchen
    if (direct) {
      resolveCache.set(cacheKey, direct);
      if (suggest) setSuggestions([]);
      return direct;
    }
    if (!suggest && resolveCache.has(cacheKey)) return null; // schon erfolglos versucht
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
    const list = names.length ? names : [""];
    if (!suggest) {
      // Automatik: alle Lesarten gleichzeitig prüfen, die erste (beste) Lesart gewinnt
      const results = await Promise.all(list.map((n) => resolve(n, info, false).catch(() => null)));
      const i = results.findIndex(Boolean);
      return i >= 0 ? { match: results[i], read: list[i] } : { match: null, read: list[0] ?? "" };
    }
    for (const n of list) {
      const match = await resolve(n, info, suggest);
      if (match) return { match, read: n };
    }
    return { match: null, read: names[0] ?? "" };
  }

  /**
   * „The List“: Diese Nachdrucke tragen Set-Code und Nummer des Originals (z. B. „MKM 94“).
   * Gibt es zu Set + Nummer auch den Druck aus The List, vergleicht der Scanner die linke
   * untere Ecke des Kamerabilds mit beiden Vorlagen. Sicher erkannt → The List übernehmen,
   * sonst bleibt das Original und der Eintrag bekommt den Umschalter „The List?“.
   */
  async function checkList(key: string, match: ScanMatch, info: CardInfo | null, region: SearchRegion | null) {
    if (!info?.set || !info.number || !match.set || match.set.toLowerCase() !== info.set.toLowerCase()) return;
    listCheckedRef.current.add(key);
    const same = (a: string, b: string) => a.split(" // ")[0].toLowerCase() === b.split(" // ")[0].toLowerCase();
    try {
      const list = await directPrint("plst", `${info.set.toUpperCase()}-${info.number}`, null, [match.name], true);
      if (!list || !same(list.name, match.name)) return;
      let take = false;
      if (region) {
        const [lt, ot] = await Promise.all([referenceStrip(list.id, list.imageUrl), referenceStrip(match.id, match.imageUrl)]);
        if (lt && ot) {
          const v = listVerdict(region, lt, ot);
          scanLog(`list ${match.name} ${v.verdict} ${v.diff.toFixed(2)}`);
          take = v.verdict === "list";
        }
      }
      setStack((s) => setAlternative(s, key, list, take));
    } catch {
      // Zugabe – ohne sie bleibt der gelesene Druck
    }
  }

  // Automatik: dieselbe Karte wie eben erst nach einem Tipp aufs Kamerabild erneut zählen.
  // Die neue Lesung ist trotzdem nützlich: Sie verbessert den Druck des obersten Eintrags.
  function blockedRepeat(name: string, auto: boolean, info: Promise<CardInfo | null> | CardInfo | null, region: SearchRegion | null): boolean {
    if (!auto || repeatOkRef.current || !isRepeatOfLast(stackRef.current, name)) return false;
    scanLog(`repeat_blocked ${name}`);
    setStatus("Gleiche Karte wie eben – zum erneuten Zählen aufs Kamerabild tippen.");
    void improveRepeat(name, info, region);
    return true;
  }

  /**
   * Die Karte liegt noch da und wurde erneut gelesen: War der Druck des obersten Eintrags nur
   * geschätzt (z. B. Nummer beim ersten Bild verlesen, weil die Karte gerade hingelegt wurde),
   * mit der neuen Lesung von Set + Nummer korrigieren – und dann „The List“ prüfen.
   */
  async function improveRepeat(name: string, infoIn: Promise<CardInfo | null> | CardInfo | null, region: SearchRegion | null) {
    const top = stackRef.current[0];
    if (!top || top.pending || top.failed || !isRepeatOfLast([top], name)) return;
    const info = await Promise.resolve(infoIn).catch(() => null);
    if (!info?.set || !info.number) return;
    const cur = stackRef.current.find((x) => x.key === top.key);
    if (!cur) return;
    if (!cur.exact) {
      const better = await directPrint(info.set, info.number, info.lang, [name], true).catch(() => null);
      if (!better || better.name.split(" // ")[0].toLowerCase() !== cur.name.split(" // ")[0].toLowerCase()) return;
      scanLog(`repeat_improved ${cur.name} ${better.set} ${better.collectorNumber}`);
      setStack((st) => updateItem(st, cur.key, { print: better }));
      void checkList(cur.key, better, info, region);
    } else if (!cur.alt && !listCheckedRef.current.has(cur.key)) {
      void checkList(cur.key, cur, info, region);
    }
  }

  function feedbackOk() {
    repeatOkRef.current = false;
    setSuggestions([]);
    setManualName("");
    setStatus(null);
    setFlash("ok");
    setTimeout(() => setFlash(null), 450);
    if (prefsRef.current.sound) beep(true);
    buzz(40);
  }

  // Name sicher erkannt: sofort auf den Stapel, Druck/Preis im Hintergrund.
  // Über deutschen Text erkannt (oder „DE“ auf der Karte gelesen) → als deutsch speichern
  function markGerman(key: string) {
    setStack((s) => updateItem(s, key, { language: "DE" }));
  }

  function acceptPending(name: string, info: Promise<CardInfo | null>, readNames: string[], camHash: CardHash | null, listRegion: SearchRegion | null = null, german = false): string {
    const foil = prefsRef.current.foil;
    const key = pendingKey();
    setStack((s) => addPending(s, name, foil, Date.now(), key).stack);
    if (german) markGerman(key);
    feedbackOk();
    void finishPending(key, name, info, readNames, camHash, foil, listRegion);
    return key;
  }

  // Druck/Preis nachtragen; die Infozeile (Set/Nummer) wird evtl. noch gelesen.
  async function finishPending(key: string, name: string, infoRead: Promise<CardInfo | null> | null, readNames: string[], camHash: CardHash | null, foil: boolean, listRegion: SearchRegion | null = null) {
    const info = infoRead ? await infoRead.catch(() => null) : null;
    if (info?.lang === "DE") markGerman(key);
    let match: ScanMatch | null = null;
    try {
      if (info?.set && info.number) match = await directPrint(info.set, info.number, info.lang, [name, ...readNames]);
      match ??= await directExact(name);
      match ??= await resolve(name, info, false);
    } catch {
      match = null;
    }
    scanLog(`pending_resolved ${match ? match.name : "-"}`);
    const keep = match && !match.exact && camHash ? Array.from(camHash) : undefined;
    setStack((s) => (match ? resolvePending(s, key, match, keep) : failPending(s, key)));
    if (match) void checkList(key, match, info, listRegion);
    if (match && !match.exact && camHash) void refinePrint(match, camHash, key, info);
  }

  function accept(match: ScanMatch, foil = prefsRef.current.foil, camHash?: CardHash): string {
    // Fingerabdruck nur merken, wenn der Druck nicht sicher ist (spart Speicher)
    const keep = !match.exact && camHash ? Array.from(camHash) : undefined;
    const key = scanKey();
    repeatOkRef.current = false;
    setStack((s) => addScan(s, match, foil, Date.now(), keep, key));
    setSuggestions([]);
    setManualName("");
    setStatus(null);
    setFlash("ok");
    setTimeout(() => setFlash(null), 450);
    if (prefsRef.current.sound) beep(true);
    buzz(40);
    return key;
  }

  // Druck per Bildvergleich bestimmen, wenn Set/Nummer nicht lesbar waren:
  // Fingerabdruck der Kamera gegen die Drucke dieser Karte (neueste zuerst).
  // Genutzt wird alles, was von der Karte gelesen wurde: auch nur das
  // Set-Kürzel oder nur die Nummer grenzt die Drucke ein, das Bild entscheidet
  // unter den übrigen.
  async function refinePrint(match: ScanMatch, camHash: CardHash, key: string, info?: CardInfo | null) {
    try {
      const all = await loadPrints(match.name);
      if (all.length < 2) return;
      const { list } = narrowPrints(all, info);
      const hashed: Array<(typeof list)[number] & { hash: CardHash | null }> = [];
      // nur die übrig gebliebenen Drucke vergleichen (spart Bilder laden)
      if (list.length > 1) for (const p of list.slice(0, MAX_HASH_PRINTS)) hashed.push({ ...p, hash: await printHash(p.id, p.imageUrl) });
      const choice = choosePrint(list.length > 1 ? hashed : list, camHash, info);
      const best = choice ? { best: choice.best } : null;
      if (!best || best.best.id === match.id) return;
      setStack((s) => {
        const item = s.find((x) => x.key === key);
        // nur diesen Scan umstellen, und nur solange noch der vermutete Druck drinsteht
        return item && item.id === match.id ? updateItem(s, key, { print: { ...best.best, exact: true } }) : s;
      });
      setToast(`Druck erkannt${choice?.by === "bild" ? " (Bild)" : ""}: ${best.best.setName ?? best.best.set?.toUpperCase()}`);
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
      // Standbild festhalten: gelesen wird in mehreren Schritten, das Video läuft weiter
      snapRef.current ??= document.createElement("canvas");
      const snap = snapRef.current;
      if (snap.width !== W || snap.height !== H) {
        snap.width = W;
        snap.height = H;
      }
      snap.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0, W, H);
      const view = viewRef.current;
      const vis = view ? visibleRegion(W, H, view.clientWidth, view.clientHeight) : { x: 0, y: 0, w: 1, h: 1 };
      const dict = nameIndexIfReady();
      scanLog("scan_start");
      // Karte als Viereck finden, entzerren, Name + Infozeile lesen
      const read = recognizeFrame(snap, W, H, vis, detectedRef.current?.video ?? guide.video, dict, setPriorIfReady(), prefsRef.current.german, germanIndexIfReady());
      // Bild der Karte festhalten (für den Bildvergleich der Drucke)
      const card = read.quad ? quadBounds(read.quad, 1, 1) : detectedRef.current?.video ?? guide.video;
      const camHash = hashOf(snap, card.x * W, card.y * H, card.w * W, card.h * H);
      // Ecke links unten festhalten (The-List-Symbol) – das Standbild wird beim nächsten Scan überschrieben
      let listRegion: SearchRegion | null = null;
      try {
        listRegion = read.quad ? readRegion(snap, W, H, read.quad) : null;
      } catch {
        listRegion = null;
      }
      // Scanner verbessern (eingeschaltet): Karte als kleines Bild merken, Lesung folgt unten
      const attempt: Attempt | null = prefsRef.current.learn
        ? { image: cardCrop(snap, W, H, read.quad ?? rectToQuad(card)), read: { names: [], info: null } }
        : null;
      lastAttemptRef.current = attempt;
      if (attempt) void read.info.then((i) => (attempt.read.info = i)).catch(() => {});
      const { names, sure, corrected, german, germanName } = await read.name;
      if (attempt) attempt.read.names = names;
      scanLog(`name_done names=${JSON.stringify(names)} sure=${sure?.name ?? "-"}`);
      const dimNow = auto && lightRef.current < DIM_LEVEL;
      if (sure) {
        // Wenig Licht: erst annehmen, wenn das nächste Bild denselben Namen liefert
        const c = confirmDim(confirmRef.current, sure.name, Date.now(), dimNow);
        confirmRef.current = c.pending;
        if (!c.accept) {
          scanLog(`dim_wait ${sure.name}`);
          return false;
        }
        if (blockedRepeat(sure.name, auto, read.info, listRegion)) return true;
        const pk = acceptPending(sure.name, read.info, names, camHash, listRegion, !!germanName);
        if (attempt) rememberAttempt(attemptsRef.current, pk, attempt);
        return true;
      }
      const info = await read.info;
      scanLog(`info_done ${JSON.stringify(info)}`);
      if (auto && (!info?.lang || info.lang === "EN")) {
        // Automatik, Name nicht sicher: Nur annehmen, wenn zwei Dinge
        // zusammenpassen – Set + Nummer ergeben eine Karte, deren Name zum
        // Gelesenen passt, oder Scryfall kennt den gelesenen Text eindeutig.
        // Ein bloß wahrscheinlicher Name allein reicht nicht (lieber noch
        // einmal lesen als eine falsche Karte im Stapel).
        const guess = bestGuess({ names, sure, corrected }, dict);
        let match: ScanMatch | null = null;
        if (info?.set && info.number) match = await directPrint(info.set, info.number, info.lang, [...names, ...(guess ? [guess.name] : [])], true).catch(() => null);
        // unscharfe Suche: bei wenig Licht nur bei sehr ähnlichem Text
        for (const raw of names.slice(0, 2)) match ??= await directByName(raw, dimNow ? 0.9 : 0.8).catch(() => null);
        scanLog(`resolved ${match ? match.name : "-"}`);
        if (match) {
          if (blockedRepeat(match.name, auto, info, listRegion)) return true;
          const scanned = accept(match, prefsRef.current.foil, camHash);
          if (attempt) rememberAttempt(attemptsRef.current, scanned, attempt);
          if (!match.exact) void refinePrint(match, camHash, scanned, info);
          else void checkList(scanned, match, info, listRegion);
          return true;
        }
        if (!german?.length) return false;
      }
      if (auto && german?.length && (!info?.lang || info.lang === "EN" || info.lang === "DE")) {
        // Englisch hat nichts ergeben – vermutlich deutsche Karte: über Set + Nummer mit dem gedruckten
        // deutschen Namen abgleichen, sonst den deutschen Namen nachschlagen.
        let match: ScanMatch | null = null;
        if (info?.set && info.number) match = await directPrint(info.set, info.number, "DE", german, true).catch(() => null);
        for (const n of german.slice(0, 2)) match ??= await resolve(n, { set: null, number: null, lang: "DE" }, false).catch(() => null);
        scanLog(`resolved_de ${match ? match.name : "-"}`);
        if (match) {
          if (blockedRepeat(match.name, auto, info, listRegion)) return true;
          const scanned = accept(match, prefsRef.current.foil, camHash);
          markGerman(scanned);
          if (attempt) rememberAttempt(attemptsRef.current, scanned, attempt);
          if (!match.exact) void refinePrint(match, camHash, scanned, info);
          else void checkList(scanned, match, info, listRegion);
          return true;
        }
        return false;
      }
      const tryNames = Array.from(new Set([...(german ?? []), ...corrected, ...names]));
      const { match, read: readName } = await resolveCandidates(tryNames, info, !auto);
      scanLog(`resolved ${match ? match.name : "-"}`);
      if (match) {
        if (blockedRepeat(match.name, auto, info, listRegion)) return true;
        const scanned = accept(match, prefsRef.current.foil, camHash);
        if (info?.lang === "DE" || (readName && german?.includes(readName))) markGerman(scanned);
          if (attempt) rememberAttempt(attemptsRef.current, scanned, attempt);
        if (!match.exact) void refinePrint(match, camHash, scanned, info);
        else void checkList(scanned, match, info, listRegion);
        return true;
      }
      if (!auto) {
        setManualName(readName);
        setStatus(readName ? `Keine Karte für „${readName}“ gefunden – Namen korrigieren oder Vorschlag antippen.` : "Kein Name erkannt – Karte gerade in den Rahmen legen.");
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
    const presentRef = { current: false };
    thumbRef.current ??= document.createElement("canvas");
    const thumb = thumbRef.current;
    thumb.width = THUMB_W;
    thumb.height = THUMB_H;
    const ctx = thumb.getContext("2d", { willReadFrequently: true })!;

    let lastDetected: Rect | null = null;
    async function tick() {
      if (stopped) return;
      const video = videoRef.current;
      const view = viewRef.current;
      // App im Hintergrund: nichts auswerten (Akku)
      const hidden = typeof document !== "undefined" && document.hidden;
      if (!hidden && video?.videoWidth && view && !scanningRef.current && !printFor && !sheetOpen) {
        const tickStart = performance.now();
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
        // nur neu zeichnen, wenn sich der Rahmen sichtbar bewegt hat
        if (!sameRect(found, lastDetected)) {
          lastDetected = found;
          setDetected(found);
        }
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
        const guideGray = grayOf(video, gv.x * video.videoWidth, gv.y * video.videoHeight, gv.w * video.videoWidth, gv.h * video.videoHeight, 24, 34);
        const guideContrast = contrast(guideGray);
        // Licht messen (geglättet, damit der Hinweis nicht flackert)
        lightRef.current = lightRef.current * 0.8 + mean(guideGray) * 0.2;
        const isDim = lightRef.current < DIM_LEVEL;
        setDim((d) => (d === isDim ? d : isDim));
        // Ersatz, falls die Kanten nicht erkannt werden (z. B. weiße Karte auf
        // hellem Tisch): sehr kontrastreicher Inhalt im Hilfsrahmen. Doppelte
        // Schwelle, damit gemusterte Tische nicht als Karte gelten.
        const present = Boolean(found) || guideContrast >= WATCH.minContrast * 2;
        if (present && !presentRef.current) scanLog("card_present", true);
        presentRef.current = present;
        const r = watchFrame(watchRef.current, frame, present);
        watchRef.current = r.state;
        scanLog(`tick ${Math.round(performance.now() - tickStart)}ms present=${present} still=${r.state.stillCount} armed=${r.state.armed}`);
        if (r.shouldScan) {
          const ok = await scanFrame(true);
          if (ok) {
            misses = 0;
            watchRef.current = markScanned(watchRef.current, frame);
          } else if (++misses >= MAX_MISSES) {
            // Mehrmals nichts erkannt: nicht endlos weiterlesen – Hinweis zeigen
            // und erst nach Kartenwechsel wieder versuchen.
            misses = 0;
            watchRef.current = markScanned(watchRef.current, frame);
            const miss = lastAttemptRef.current;
            if (prefsRef.current.learn && miss) void reportScan("miss", { read: miss.read, image: miss.image });
            setStatus("Nicht erkannt – Karte ausrichten, Licht verbessern oder Auslöser/Namen nutzen.");
            if (prefsRef.current.sound) beep(false);
          }
        }
      }
      // Takt anpassen: schnell nur, wenn eine ungelesene Karte daliegt
      if (!stopped)
        setTimeout(tick, nextTickMs({ hidden, present: presentRef.current, armed: watchRef.current.armed }));
    }
    const t = setTimeout(tick, 200);
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
      const whole = { x: 0, y: 0, w: 1, h: 1 };
      const photo = recognizeFrame(full, w, h, whole, card ?? whole, nameIndexIfReady(), setPriorIfReady(), prefsRef.current.german, germanIndexIfReady());
      if (card || photo.quad) {
        const name = await photo.name;
        const info = await photo.info;
        if (name.sure) {
          acceptPending(name.sure.name, Promise.resolve(info), name.names, null);
          return;
        }
        result = await resolveCandidates(Array.from(new Set([...name.corrected, ...name.names])), info, true);
      } else {
        // Mehrere Zeilen: kurz auf automatische Seitenaufteilung umstellen
        const worker = await getNameWorker();
        await worker.setParameters({ tessedit_pageseg_mode: "3" as never });
        const lines = await ocrLines(regionToCanvas(full, 0, 0, w, h * 0.5), worker).finally(() =>
          worker.setParameters({ tessedit_pageseg_mode: NAME_PSM as never }),
        );
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

  // Karte aus der Suche (Katalog) übernehmen; auf Wunsch gleich den Druck wählen
  function pickManual(match: ScanMatch, choosePrint: boolean) {
    const key = accept(match);
    if (choosePrint) setPrintFor(key);
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
    const open = unresolved(stack);
    if (open.pending) {
      setSaveMsg(`Einen Moment – ${open.pending} ${open.pending === 1 ? "Karte lädt" : "Karten laden"} noch Druck und Preis.`);
      return;
    }
    if (open.failed) {
      setSaveMsg(`${open.failed} ${open.failed === 1 ? "Karte wurde" : "Karten wurden"} nicht gefunden – bitte korrigieren oder entfernen.`);
      return;
    }
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
          folderId: target.kind === "collection" ? target.folderId ?? null : undefined,
          items: chunk.map((s, i) => ({ i, name: s.name, scryfallId: s.id, quantity: s.quantity, foil: s.foil, language: s.language ?? "EN" })),
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
    const folderName = target.kind === "collection" ? folders.find((f) => f.id === target.folderId)?.name : undefined;
    const where =
      target.kind === "collection"
        ? folderName
          ? `im Ordner „${folderName}“`
          : "in der Sammlung"
        : target.kind === "wishlist" ? "auf der Wunschliste" : `im Deck „${decks.find((d) => d.id === target.deckId)?.name ?? ""}“`;
    setSaveMsg(
      failed
        ? `${savedCards} Karten ${where} gespeichert, ${failed} Einträge nicht – sie bleiben im Stapel, bitte erneut speichern.`
        : `✓ ${savedCards} Karten ${where} gespeichert.`,
    );
    // Neu laden erst nach der Wunschlisten-Frage – das Neuladen setzt die Seite zurück
    const names = target.kind === "collection" ? items.filter((s) => saved.has(s.key)).map((s) => s.name) : [];
    if (names.length) setCleanupNames(names);
    else router.refresh();
  }

  const totals = stackTotals(stack);
  const last = stack[0];
  const targetLabel =
    prefs.target.kind === "collection"
      ? (() => {
          const folder = folders.find((f) => f.id === (prefs.target as { folderId?: string }).folderId)?.name;
          return folder ? `Sammlung · Ordner ${folder}` : "Sammlung";
        })()
      : prefs.target.kind === "wishlist"
        ? "Wunschliste"
        : `Deck: ${decks.find((d) => d.id === (prefs.target as { deckId: string }).deckId)?.name ?? "?"}`;
  const targetValue =
    prefs.target.kind === "deck"
      ? `deck:${prefs.target.deckId}`
      : prefs.target.kind === "collection" && prefs.target.folderId
        ? `folder:${prefs.target.folderId}`
        : prefs.target.kind;
  const setTarget = (v: string) =>
    setPrefs((p) => ({
      ...p,
      target: v.startsWith("deck:")
        ? { kind: "deck", deckId: v.slice(5) }
        : v.startsWith("folder:")
          ? { kind: "collection", folderId: v.slice(7) }
          : { kind: v as "collection" | "wishlist" },
    }));

  const targetOptions = (
    <>
      <option value="collection">Sammlung</option>
      {folders.length > 0 && (
        <optgroup label="Sammlung + Ordner">
          {folders.map((f) => (
            <option key={f.id} value={`folder:${f.id}`}>
              Ordner: {f.name}
            </option>
          ))}
        </optgroup>
      )}
      <option value="wishlist">Wunschliste</option>
      {decks.length > 0 && (
        <optgroup label="Decks">
          {decks.map((d) => (
            <option key={d.id} value={`deck:${d.id}`}>
              Deck: {d.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
  const targetIcon = prefs.target.kind === "deck" ? "🃏" : prefs.target.kind === "wishlist" ? "★" : "📚";

  // Kamera-Ansicht: gut sichtbares Ziel oben in der Mitte
  const targetSelect = (
    <label className="relative inline-flex min-w-0">
      <span className="sr-only">Speichern in</span>
      <select
        value={targetValue}
        onChange={(e) => setTarget(e.target.value)}
        className="appearance-none rounded-full bg-white text-zinc-900 font-semibold shadow-lg pl-8 pr-7 h-10 text-sm outline-none max-w-[14rem] truncate"
      >
        {targetOptions}
      </select>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" aria-hidden>
        {targetIcon}
      </span>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500" aria-hidden>
        ▼
      </span>
    </label>
  );

  // Startseite: großes Feld "Gescannte Karten landen in …"
  const targetCard = (
    <label className="surface-strong press relative flex items-center gap-3 p-4 cursor-pointer">
      <span className="grid place-items-center w-12 h-12 shrink-0 rounded-2xl bg-indigo-500/20 ring-1 ring-inset ring-indigo-400/40 text-xl" aria-hidden>
        {targetIcon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-indigo-300">Gescannte Karten landen in</span>
        <span className="block text-lg font-semibold truncate">{targetLabel}</span>
      </span>
      <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200">Ändern ▾</span>
      <select
        value={targetValue}
        onChange={(e) => setTarget(e.target.value)}
        aria-label="Speichern in"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {targetOptions}
      </select>
    </label>
  );

  const stackSheet = (
    <StackList
      stack={stack}
      onQty={(k, q) => setStack((s) => setQuantity(s, k, q))}
      onFoil={(k, f) => setStack((s) => updateItem(s, k, { foil: f }))}
      onLanguage={(k, l) => setStack((s) => updateItem(s, k, { language: l }))}
      onSwap={(k) => {
        const it = stack.find((x) => x.key === k);
        if (it?.alt) learnFix("list_swap", k, it, it.alt);
        setStack((s) => swapAlternative(s, k));
      }}
      onPrints={(item) => setPrintFor(item.key)}
      onFix={(item) => {
        setStack((st) => st.filter((x) => x.key !== item.key));
        setManualName(item.name);
        setStatus(`„${item.name}“ wurde nicht gefunden – Namen prüfen und suchen.`);
      }}
      selectMode={stackSelect}
      selected={stackSelected}
      onToggle={(k) => setStackSelected((sel) => toggle(sel, k))}
    />
  );

  const selectButton = stack.length > 0 && (
    <button
      onClick={() => {
        setStackSelect((v) => !v);
        setStackSelected(new Set());
      }}
      className={`rounded-lg px-3 h-8 text-xs font-medium border transition ${
        stackSelect ? "bg-indigo-500/20 border-indigo-400/60 text-white" : "bg-white/5 border-white/10 text-zinc-300 hover:border-white/20"
      }`}
    >
      {stackSelect ? "Fertig" : "Auswählen"}
    </button>
  );

  const stackSelectionBar = stackSelect && (
    <SelectionBar
      count={stackSelected.size}
      total={stack.length}
      onToggleAll={() => setStackSelected((sel) => toggleAll(sel, stack.map((x) => x.key)))}
      onCancel={() => {
        setStackSelect(false);
        setStackSelected(new Set());
      }}
      onConfirm={() => {
        setStack((s) => s.filter((x) => !stackSelected.has(x.key)));
        setStackSelected(new Set());
        setStackSelect(false);
      }}
      actionLabel="Entfernen"
      confirmText="{n} Einträge aus dem Scan-Stapel entfernen?"
      overlay={cameraOn}
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
    <main className="page max-w-lg">
      {cleanupNames && <WishlistCleanup names={cleanupNames} onDone={() => { setCleanupNames(null); router.refresh(); }} />}
      <PageHeader
        title="Scannen"
        subtitle="Karte ins Bild legen und kurz ruhig halten – Name, Set, Nummer und Druck werden automatisch erkannt. Deutsche und englische Karten."
      />

      {targetCard}

      <button
        onClick={startCamera}
        className="group relative w-full overflow-hidden rounded-3xl p-5 text-left bg-gradient-to-br from-indigo-500 via-indigo-600 to-fuchsia-600 shadow-glow ring-1 ring-inset ring-white/20"
      >
        <span className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" aria-hidden />
        <span className="relative flex items-center gap-4">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-white/15 ring-1 ring-inset ring-white/25">
            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M8 9h8v6H8z" />
            </svg>
          </span>
          <span>
            <span className="block text-lg font-semibold">Scanner starten</span>
            <span className="block text-sm text-white/75">Kamera öffnen und Karten nacheinander erfassen</span>
          </span>
        </span>
      </button>
      <label className="btn-secondary w-full cursor-pointer">
        Foto aus der Mediathek wählen
        <input ref={fileRef} type="file" accept="image/*" onChange={scanFromFile} className="hidden" disabled={scanning} />
      </label>
      {cameraError && <p className="text-sm text-amber-400">{cameraError}</p>}
      <label className="flex items-start gap-2.5 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={!!prefs.learn}
          onChange={(e) => setPrefs((p) => ({ ...p, learn: e.target.checked }))}
          className="mt-0.5 accent-indigo-500"
        />
        <span>
          <span className="text-zinc-300">Scanner verbessern helfen:</span> Wird eine Karte nicht erkannt oder korrigierst du den Druck, wird ein kleines Bild nur
          der Karte mit dem Gelesenen gespeichert. So lässt sich die Erkennung an echten Fällen verbessern.
        </span>
      </label>


      {!cameraOn && status && (
        <p className="text-sm text-zinc-300" aria-live="polite">
          {status}
        </p>
      )}
      {!cameraOn && (
        <CardSearch
          value={manualName}
          onChange={setManualName}
          onPick={pickManual}
          onFallback={searchManual}
          busy={scanning}
          suggestions={suggestions}
          onSuggestion={searchManual}
        />
      )}

      {saveMsg && <p className="text-sm text-emerald-300" aria-live="polite">{saveMsg}</p>}

      {stack.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">
              Scan-Stapel <span className="text-sm text-zinc-500">{totals.cards} Karten</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-emerald-400 tabular-nums">{formatEur(totals.value)}</span>
              {!cameraOn && selectButton}
            </div>
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
          <div
            ref={viewRef}
            className="relative flex-1 overflow-hidden"
            onClick={(e) => {
              // Tipp aufs Kamerabild (nicht auf Knöpfe): dieselbe Karte darf noch einmal gezählt werden
              const control = (e.target as HTMLElement).closest("button, a, select, input, label");
              if (control && e.currentTarget.contains(control)) return;
              repeatOkRef.current = true;
              watchRef.current = { ...watchRef.current, armed: true, stillCount: 0 };
              scanLog("repeat_ok");
              setStatus(prefsRef.current.auto ? "Okay – die Karte wird noch einmal gezählt." : null);
            }}
          >
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

            {/* Hinweis bei wenig Licht */}
            {dim && prefs.auto && !torch && (
              <div className="absolute top-[calc(4rem+env(safe-area-inset-top))] inset-x-0 flex justify-center px-3 pointer-events-none">
                <p className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-300/95 text-zinc-900 text-xs font-medium px-3 py-1.5 shadow" role="status">
                  Wenig Licht – Karte wird doppelt geprüft
                  {torch != null && (
                    <button onClick={toggleTorch} className="rounded-full bg-zinc-900 text-amber-200 px-2 py-0.5">
                      ϟ Lampe an
                    </button>
                  )}
                </p>
              </div>
            )}

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
                <Toggle
                  on={prefs.german}
                  onClick={() =>
                    setPrefs((p) => {
                      // deutsches Lesemodell gleich laden, nicht erst bei der ersten Karte
                      if (!p.german) void getGermanWorker().catch(() => {});
                      return { ...p, german: !p.german };
                    })
                  }
                  label="Deutsch"
                />
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
                    {last.language === "DE" && <span className="text-amber-300"> · Deutsch</span>}
                  </p>
                  {last.alt && (
                    <button
                      onClick={() => {
                        if (last.alt) learnFix("list_swap", last.key, last, last.alt);
                        setStack((st) => swapAlternative(st, last.key));
                      }}
                      className="mt-0.5 rounded-full px-2 h-5 text-[10px] border border-sky-400/50 bg-sky-500/10 text-sky-200"
                    >
                      {last.set === "plst" ? "Doch Original?" : "The List?"}
                    </button>
                  )}
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
                className="w-full max-h-[85dvh] overflow-y-auto rounded-t-[2rem] bg-zinc-900 border-t border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mx-auto h-1 w-10 rounded-full bg-zinc-700" aria-hidden />
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    Scan-Stapel <span className="text-sm text-zinc-500">{totals.cards} Karten</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-emerald-400 tabular-nums">{formatEur(totals.value)}</span>
                    {selectButton}
                  </div>
                </div>
                <CardSearch
                  value={manualName}
                  onChange={setManualName}
                  onPick={pickManual}
                  onFallback={searchManual}
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

      {stackSelectionBar}
      {stackSelect && <div className="h-24" aria-hidden />}

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
            const item = stack.find((x) => x.key === printFor);
            if (item && p.id !== item.id) learnFix("print_fix", printFor, item, p);
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

function StackList({
  stack,
  onQty,
  onFoil,
  onLanguage,
  onSwap,
  onPrints,
  onFix,
  selectMode = false,
  selected,
  onToggle,
}: {
  stack: ScanItem[];
  onQty: (key: string, q: number) => void;
  onFoil: (key: string, foil: boolean) => void;
  /** Sprache umschalten (Englisch ↔ Deutsch) */
  onLanguage: (key: string, language: string) => void;
  /** The List ↔ Original tauschen */
  onSwap: (key: string) => void;
  onPrints: (item: ScanItem) => void;
  /** nicht gefundene Karte korrigieren */
  onFix: (item: ScanItem) => void;
  selectMode?: boolean;
  selected?: Set<string>;
  onToggle?: (key: string) => void;
}) {
  return (
    <ul className="surface divide-y divide-white/5 overflow-hidden">
      {stack.map((s) => (
        <li
          key={s.key}
          // Im Auswahlmodus wählt ein Tipp nur aus – Knöpfe der Zeile ruhen
          className={`flex items-center gap-3 px-3 py-2 ${selectMode ? "cursor-pointer [&_button]:pointer-events-none" : ""} ${
            selectMode && selected?.has(s.key) ? "bg-indigo-500/15" : ""
          }`}
          onClick={selectMode ? () => onToggle?.(s.key) : undefined}
          aria-selected={selectMode ? selected?.has(s.key) : undefined}
        >
          {selectMode && <SelectCheck selected={!!selected?.has(s.key)} className="shrink-0" />}
          <button
            onClick={() => !s.pending && !s.failed && onPrints(s)}
            className={`relative shrink-0 w-10 h-14 rounded-[4px] overflow-hidden bg-zinc-800 ${s.pending ? "animate-pulse" : ""}`}
            aria-label={`Druck von ${s.name} ändern`}
          >
            {s.imageUrl && <Image src={s.imageUrl} alt="" width={40} height={56} className="w-full h-full object-cover" />}
            {s.foil && <span className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/30 via-transparent to-cyan-300/30" aria-hidden />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{s.name}</p>
            {s.pending ? (
              <p className="text-xs text-indigo-300 animate-pulse">Lade Druck &amp; Preis …</p>
            ) : s.failed ? (
              <button onClick={() => onFix(s)} className="text-xs text-red-300 underline text-left">
                Nicht gefunden – antippen zum Korrigieren
              </button>
            ) : (
            <>
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
              <button
                onClick={() => onLanguage(s.key, s.language === "DE" ? "EN" : "DE")}
                aria-pressed={s.language === "DE"}
                aria-label={s.language === "DE" ? "Deutsch – auf Englisch umstellen" : "Englisch – auf Deutsch umstellen"}
                className={`rounded-full px-2 h-6 text-[11px] border ${s.language === "DE" ? "bg-amber-500/20 border-amber-400/60 text-amber-100" : "border-white/10 text-zinc-400"}`}
              >
                {s.language === "DE" ? "DE" : "EN"}
              </button>
              {s.alt && (
                <button
                  onClick={() => onSwap(s.key)}
                  className="rounded-full px-2 h-6 text-[11px] border border-sky-400/50 bg-sky-500/10 text-sky-200"
                  title={s.set === "plst" ? "Als Originaldruck zählen" : "Nachdruck aus „The List“ (kleines Planeswalker-Symbol unten links)"}
                >
                  {s.set === "plst" ? "Doch Original?" : "The List?"}
                </button>
              )}
              <span className="text-xs text-emerald-400 tabular-nums">{formatEur(unitPrice(s))}</span>
            </div>
            </>
            )}
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
