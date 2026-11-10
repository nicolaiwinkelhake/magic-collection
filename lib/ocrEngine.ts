// Texterkennung im Browser (tesseract.js), selbst ausgeliefert unter
// /ocr/<version>/ (siehe scripts/copy-ocr-assets.mjs).
// Zwei Worker laufen parallel: einer für den Kartennamen (Deutsch +
// Englisch), einer für die Infozeile (Set-Kürzel/Nummer, nur Großbuchstaben
// und Ziffern) – das halbiert die Lesezeit je Karte.
import type { Worker } from "tesseract.js";
import tesseractPkg from "tesseract.js/package.json";

const BASE = `/ocr/${tesseractPkg.version}`;

let nameWorker: Promise<Worker> | null = null;
let infoWorker: Promise<Worker> | null = null;

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
  nameWorker ??= create(["eng", "deu"], {}).catch((e) => {
    nameWorker = null; // beim nächsten Versuch neu laden
    throw e;
  });
  return nameWorker;
}

export function getInfoWorker(): Promise<Worker> {
  infoWorker ??= create(["eng"], {
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/•*-. ",
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
  const ws = [nameWorker, infoWorker];
  nameWorker = infoWorker = null;
  await Promise.all(ws.map((w) => w?.then((x) => x.terminate()).catch(() => {})));
}
