// Texterkennung im Browser (tesseract.js), selbst ausgeliefert unter
// /ocr/<version>/ (siehe scripts/copy-ocr-assets.mjs).
// Zwei Worker laufen parallel: einer für den Kartennamen (Englisch – das
// ist fast doppelt so schnell wie Englisch + Deutsch), einer für die
// Infozeile (Set-Kürzel/Nummer, nur Großbuchstaben und Ziffern). Ein dritter
// (Deutsch + Englisch) wird nur geladen, wenn eine deutsche Karte auftaucht.
import type { Worker } from "tesseract.js";
import tesseractPkg from "tesseract.js/package.json";

const BASE = `/ocr/${tesseractPkg.version}`;

export const NAME_PSM = "6";

let nameWorker: Promise<Worker> | null = null;
let infoWorker: Promise<Worker> | null = null;
let germanWorker: Promise<Worker> | null = null;

async function create(langs: string[], params: Record<string, string>): Promise<Worker> {
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker(langs, OEM.LSTM_ONLY, {
    workerPath: `${BASE}/worker.min.js`,
    corePath: BASE,
    langPath: `${BASE}/lang`,
    gzip: true,
  });
  await worker.setParameters(params);
  return worker;
}

export function getNameWorker(): Promise<Worker> {
  // Seitenmodus 6 = ein Textblock: kommt mit den Rahmenstreifen über und
  // unter dem Namen zurecht (Modus 7 "eine Zeile" verliest sich daran)
  nameWorker ??= create(["eng"], { tessedit_pageseg_mode: NAME_PSM }).catch((e) => {
    nameWorker = null; // beim nächsten Versuch neu laden
    throw e;
  });
  return nameWorker;
}

/** Für deutsche Karten (Umlaute, deutsche Wörter) – erst bei Bedarf geladen. */
export function getGermanWorker(): Promise<Worker> {
  germanWorker ??= create(["deu", "eng"], { tessedit_pageseg_mode: NAME_PSM }).catch((e) => {
    germanWorker = null;
    throw e;
  });
  return germanWorker;
}

export function getInfoWorker(): Promise<Worker> {
  infoWorker ??= create(["eng"], {
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•*-. ",
    tessedit_pageseg_mode: "6", // ein Textblock (zwei kurze Zeilen)
  }).catch((e) => {
    infoWorker = null;
    throw e;
  });
  return infoWorker;
}

/** Beide Worker vorab laden (z. B. beim Start der Kamera). */
export function warmUp(): Promise<unknown> {
  return Promise.all([getNameWorker(), getInfoWorker()]);
}

export async function terminateAll() {
  const ws = [nameWorker, infoWorker, germanWorker];
  nameWorker = infoWorker = germanWorker = null;
  await Promise.all(ws.map((w) => w?.then((x) => x.terminate()).catch(() => {})));
}
