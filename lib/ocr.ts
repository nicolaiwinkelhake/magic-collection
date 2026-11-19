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

/** `x0`: linker Rand der Zeile im gelesenen Bild (0–1), falls bekannt */
export type OcrLine = { text: string; confidence: number; x0?: number };

// Ein Kartenname beginnt links im Namensbalken. Fängt die Lesung deutlich
// weiter rechts an, fehlt vermutlich der Anfang ("Tainted Remedy" → "Remedy",
// das es als eigene Karte gibt) – solche Lesungen dürfen nicht sofort gelten.
export const LATE_START = 0.2;

/** Gesäuberte Lesungen (klein geschrieben), deren Zeile zu weit rechts beginnt. */
export function lateStarts(lines: OcrLine[], limit = LATE_START): Set<string> {
  return new Set(lines.filter((l) => (l.x0 ?? 0) > limit).map((l) => cleanOcrLine(l.text).toLowerCase()));
}

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
export function preprocessPixels(data: Uint8ClampedArray, clip = 0): void {
  let sum = 0;
  const n = data.length / 4;
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = g;
    hist[g]++;
    sum += g;
  }
  // Grenzen: normal Minimum/Maximum; mit `clip` per Perzentil (Zusatzversuch
  // bei Rauschen: einzelne verrauschte Pixel verhindern sonst das Strecken)
  const pct = clip;
  let min = -1;
  let max = 255;
  for (let v = 0, acc = 0; v < 256; v++) {
    acc += hist[v];
    if (min < 0 && acc > n * pct) min = v;
    if (acc >= n * (1 - pct)) {
      max = v;
      break;
    }
  }
  min = Math.max(0, min);
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

/** Bekannte Set-Kürzel mit Gewicht (höher = wahrscheinlicher: eigene Sammlung, neue Sets). */
export type SetPrior = Map<string, number>;

// Zeichen, die die Texterkennung in der kleinen Infozeile gern verwechselt
const CONFUSABLE = ["OD0Q", "IL1T", "S5", "B8ER", "G6C", "Z2", "MN", "UV", "FP"];
const confusable = (a: string, b: string) => CONFUSABLE.some((g) => g.includes(a) && g.includes(b));

/**
 * Gelesenes Set-Kürzel auf ein bekanntes Set bringen: unverändert, wenn es
 * existiert; sonst das wahrscheinlichste Set, das sich nur in einem leicht
 * verwechselbaren Zeichen unterscheidet ("TOM" → "TDM").
 */
export function snapSet(read: string, sets: SetPrior | undefined): string {
  const code = read.toLowerCase();
  if (!sets || sets.has(code)) return code;
  let best: string | null = null;
  let bestW = -1;
  for (const [cand, weight] of sets) {
    if (cand.length !== code.length) continue;
    let diff = 0;
    let ok = true;
    for (let i = 0; i < code.length && ok; i++) {
      if (cand[i] === code[i]) continue;
      diff++;
      if (diff > 1 || !confusable(cand[i].toUpperCase(), code[i].toUpperCase())) ok = false;
    }
    if (ok && diff === 1 && weight > bestW) {
      best = cand;
      bestW = weight;
    }
  }
  return best ?? code;
}

/** Sammlernummer aus einer Zeile: "123/280", "U 0055", "M0167". */
function numberIn(line: string): string | null {
  const frac = line.match(/\b0*(\d{1,4})\s*\/\s*\d{1,4}\b/);
  if (frac) return frac[1];
  // moderne Karten: vierstellig mit führenden Nullen, davor oft die Seltenheit
  const padded = line.match(/(?:^|[^0-9])(\d{4})(?!\d)/);
  if (padded) return String(Number(padded[1]));
  const plain = line.match(/(?:^|[^0-9])(\d{1,3})(?!\d)/);
  return plain ? String(Number(plain[1])) : null;
}

export function parseCardInfo(text: string, sets?: SetPrior): CardInfo {
  const lines = text
    .split(/\n|\|/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // Set-Kürzel steht direkt vor der Sprache, getrennt durch •, +, «, - o. Ä.
  const setRe = new RegExp(String.raw`\b([A-Z0-9]{3,5})\s*[^A-Za-z0-9\s]?\s*(${LANGS.join("|")})\b`);
  let setLine = -1;
  let setMatch: RegExpMatchArray | null = null;
  for (let i = lines.length - 1; i >= 0 && !setMatch; i--) {
    setMatch = lines[i].match(setRe);
    if (setMatch) setLine = i;
  }
  // Sammlernummer: bevorzugt die Zeile direkt über dem Set (dort steht sie
  // auf modernen Karten), dann die Set-Zeile selbst, dann irgendeine –
  // darüber liegt oft noch Müll vom unteren Rand der Textbox.
  let number: string | null = null;
  const order = setLine >= 0 ? [setLine - 1, setLine, ...lines.map((_, i) => i).filter((i) => i < setLine - 1).reverse()] : lines.map((_, i) => i).reverse();
  for (const i of order) {
    if (i < 0 || number) continue;
    // in der Set-Zeile nur den Teil vor dem Set-Kürzel (dahinter: Künstler, Jahr)
    const part = i === setLine && setMatch ? lines[i].slice(0, setMatch.index) : lines[i];
    number = numberIn(part);
  }
  const lang = setMatch?.[2] === "JP" ? "JA" : setMatch?.[2] ?? null;
  return { set: setMatch ? snapSet(setMatch[1], sets) : null, number, lang };
}
