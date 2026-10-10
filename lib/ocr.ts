// Hilfen für den Kartenscan (rein, getestet).

// OCR-Zeile säubern: nur Buchstaben (inkl. Umlaute/Akzente), Apostroph,
// Komma, Bindestrich, Leerzeichen. Kommas bleiben erhalten – viele Namen
// enthalten eines ("Atraxa, Praetors' Voice"); früher wurde dort
// abgeschnitten und eine falsche Karte gefunden.
export function cleanOcrLine(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/[|]/g, "l")
    .replace(/[^a-zA-ZÀ-ÿ',\- ]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,'-]+|[\s,'-]+$/g, "")
    .trim();
}

export type OcrLine = { text: string; confidence: number };

// Kandidaten für den Kartennamen aus mehreren OCR-Zeilen: gesäubert, mit
// mindestens 3 Buchstaben, sinnvoller Länge, sortiert nach Konfidenz.
export function nameCandidates(lines: OcrLine[], max = 3): string[] {
  const seen = new Set<string>();
  return lines
    .map((l) => ({ text: cleanOcrLine(l.text), confidence: l.confidence }))
    .filter((l) => (l.text.match(/[a-zA-ZÀ-ÿ]/g)?.length ?? 0) >= 3 && l.text.length <= 45)
    .sort((a, b) => b.confidence - a.confidence)
    .map((l) => l.text)
    .filter((t) => (seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true)))
    .slice(0, max);
}

// Varianten für die Scryfall-Suche: voller Text, dann ohne die letzten
// Wörter (OCR liest oft Manasymbole o. Ä. als Buchstaben mit).
export function resolveVariants(name: string, maxDrop = 2): string[] {
  const words = name.split(" ").filter(Boolean);
  const variants = [words.join(" ")];
  for (let drop = 1; drop <= maxDrop && words.length - drop >= 1; drop++) {
    const v = words.slice(0, words.length - drop).join(" ");
    if (v.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 3) variants.push(v);
  }
  return Array.from(new Set(variants));
}

// Bild für OCR aufbereiten: Graustufen, Kontrast strecken; helle Schrift auf
// dunklem Grund (z. B. Showcase-Rahmen) wird invertiert. Arbeitet direkt auf
// RGBA-Pixeldaten (ImageData.data).
export function preprocessPixels(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
    sum += g;
  }
  const invert = sum / n < 110;
  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    let v = ((data[i] - min) / range) * 255;
    if (invert) v = 255 - v;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

// Infozeile unten links auf Karten ab 2023 (bzw. Sammlernummer + Set ab 2015),
// z. B. "U 0001\nMKM • EN" oder "123/280 R\nDMU • DE". Liefert Set-Kürzel,
// Sammlernummer und Sprache – damit lässt sich der genaue Druck bestimmen.
const LANGS = ["EN", "DE", "FR", "IT", "ES", "PT", "JA", "JP", "RU", "KO", "ZH", "CS", "CT", "PH"];

export type CardInfo = { set: string | null; number: string | null; lang: string | null };

export function parseCardInfo(text: string): CardInfo {
  const flat = text.replace(/\s+/g, " ");
  // Set-Kürzel steht direkt vor der Sprache, getrennt durch •, +, «, - o. Ä.
  const setMatch = flat.match(new RegExp(String.raw`\b([A-Z0-9]{3,5})\s*[^A-Za-z0-9\s]?\s*(${LANGS.join("|")})\b`));
  // Sammlernummer: erste Zahl mit 1–4 Ziffern (optional "/Gesamtzahl").
  const numMatch = flat.match(/\b0*(\d{1,4})(?:\s*\/\s*\d{1,4})?\b/);
  const lang = setMatch?.[2] === "JP" ? "JA" : setMatch?.[2] ?? null;
  return {
    set: setMatch ? setMatch[1].toLowerCase() : null,
    number: numMatch ? numMatch[1] : null,
    lang,
  };
}
