// Erkennungs-Kern des Scanners (Browser): Karte im Kamerabild als Viereck
// finden, entzerren, Namen und Infozeile lesen und per Wörterbuch
// entscheiden, wie sicher der Name ist. Ohne Netz und ohne Oberfläche – App
// und Messstand (scripts/scan-bench) nutzen denselben Code.
//
// Tempo: Der Name kommt zuerst (ein kurzer Lesevorgang); die Infozeile
// (Set/Nummer → genauer Druck) läuft parallel und darf später fertig werden.
import { detectQuadBoth, type Quad } from "@/lib/cardQuad";
import { levels } from "@/lib/grayLevels";
import type { CardInfo, SetPrior } from "@/lib/ocr";
import { matchName, PROBABLE, type NameIndex, type NameMatch } from "@/lib/nameIndex";
import { getGermanWorker } from "@/lib/ocrEngine";
import { englishFor, type GermanIndex } from "@/lib/germanIndex";
import { grayOf } from "@/lib/printHashClient";
import type { Rect } from "@/lib/scanGeometry";
import { QUAD_W, readInfo, readName, rectToQuad } from "@/lib/scanRead";

/** unterhalb dieser Ähnlichkeit zum besten englischen Namen wird zusätzlich deutsch gelesen */
export const GERMAN_BELOW = 0.85;

export type NameRead = {
  /** Lesarten des Namensbalkens (beste zuerst) */
  names: string[];
  /** Name so sicher, dass sofort bestätigt werden darf */
  sure: NameMatch | null;
  /** per Wörterbuch korrigierte Namen (für die Suche im Netz) */
  corrected: string[];
  /** Lesarten mit deutschem Modell – nur wenn kein englischer Name passte */
  german?: string[];
  /** erkannt über das deutsche Wörterbuch: der gedruckte deutsche Name */
  germanName?: string;
};

export type FrameRead = {
  /** Ecken der Karte relativ zum Bild; null = nicht gefunden (Hilfsrahmen genutzt) */
  quad: Quad | null;
  name: Promise<NameRead>;
  /** Infozeile: Set, Nummer, Sprache */
  info: Promise<CardInfo | null>;
};

/**
 * Lesarten per Wörterbuch bewerten (rein, getestet). Sofort sicher ist ein
 * Name nur, wenn nichts dagegen spricht:
 * - die Lesung beginnt links im Namensbalken (sonst fehlt wohl der Anfang),
 * - keine andere Lesart deutet auf einen längeren Namen, der ihn enthält
 *   ("Tainted Remedy" neben "Remedy").
 */
export function judge(names: string[], dict: NameIndex | null, late: Set<string> = new Set()): NameRead {
  if (!dict) return { names, sure: null, corrected: [] };
  const hits = names.map((n) => ({ read: n, m: matchName(dict, n) })).filter((x): x is { read: string; m: NameMatch } => !!x.m);
  const probable = hits.filter((x) => x.m.score >= PROBABLE);
  const longer = (name: string) => probable.some((x) => x.m.name !== name && x.m.name.toLowerCase().includes(name.toLowerCase()));
  const sure = hits.find((x) => x.m.confident && !late.has(x.read.toLowerCase()) && !longer(x.m.name))?.m ?? null;
  return { names, sure, corrected: hits.filter((x) => x.m.score >= 0.7).map((x) => x.m.name) };
}

/** Wahrscheinlichster Name einer Lesung (auch wenn nicht sicher) */
export function bestGuess(read: NameRead, dict: NameIndex | null): NameMatch | null {
  if (read.sure) return read.sure;
  if (!dict) return null;
  let best: NameMatch | null = null;
  for (const n of read.names) {
    const m = matchName(dict, n);
    if (m && m.score >= PROBABLE && (!best || m.score > best.score)) best = m;
  }
  return best;
}

export function recognizeFrame(
  source: CanvasImageSource,
  w: number,
  h: number,
  /** sichtbarer Bildausschnitt (relativ) – nur dort wird die Karte gesucht */
  region: Rect,
  /** Ersatz, wenn kein Viereck gefunden wird: erkannte Karte oder Hilfsrahmen (relativ zum Bild) */
  fallback: Rect,
  dictionary: NameIndex | null,
  sets?: SetPrior,
  /** Schalter "Deutsch": gleich mit dem deutschen Modell lesen (liest auch Englisch, nur langsamer) */
  germanFirst = false,
  /** deutsches Wörterbuch (falls geladen): deutsche Namen ohne Netz erkennen */
  german: GermanIndex | null = null,
): FrameRead {
  const qw = QUAD_W;
  const qh = Math.max(24, Math.round((qw * region.h * h) / (region.w * w)));
  const g = grayOf(source, region.x * w, region.y * h, region.w * w, region.h * h, qw, qh);
  const lv = levels(g);
  // Flaues/dunkles Bild (wenig Licht, schwarze Karte auf dunklem Tisch):
  // zusätzlich im aufbereiteten Suchbild nach der Karte suchen und den Namen
  // aufgehellt nachlesen – aber nur als Zusatzversuch, der normale Weg bleibt
  // zuerst (Messung: allein aufbereitet verschlechtert manche Karten).
  const flat = lv.hi - lv.lo < 170;
  const dim = lv.mean < 85;
  const raw = detectQuadBoth(g, qw, qh);
  const enh = flat ? detectQuadBoth(g, qw, qh, true) : null;
  const found = raw ?? enh;
  const toImage = (q: Quad) => q.map((p) => ({ x: region.x + (p.x / qw) * region.w, y: region.y + (p.y / qh) * region.h })) as Quad;
  const quad = found ? toImage(found.quad) : rectToQuad(fallback);
  const alt = found?.alt ? toImage(found.alt) : null;
  // anderes Viereck aus dem aufbereiteten Bild (nur wenn deutlich verschieden)
  const differs = (a: Quad, b: Quad) => a.some((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) > 2);
  const extra = raw && enh && differs(raw.quad, enh.quad) ? toImage(enh.quad) : null;

  const info = (async () => {
    const first = await readInfo(source, w, h, quad, sets).catch(() => null);
    if (first?.set && first.number) return first;
    let best = first;
    // Andere Lesarten probieren: robuster aufbereitet (Rauschen), innerer
    // Rahmen ↔ Kartenrand, Viereck aus dem aufbereiteten Bild
    const tries: Array<[Quad, boolean]> = [[quad, true]];
    if (alt) tries.push([alt, false]);
    if (extra) tries.push([extra, false]);
    for (const [q, robust] of tries) {
      const next = await readInfo(source, w, h, q, sets, robust).catch(() => null);
      if (next?.set && next.number) return next;
      if (!best?.set && next) best = next;
    }
    return best;
  })();

  const name = (async () => {
    const worker = germanFirst ? await getGermanWorker() : undefined;
    const first = await readName(source, w, h, quad, worker);
    let read = judge(first.names, dictionary, first.late);
    if (read.sure) return read;
    // weitere Versuche; alle Lesarten gemeinsam bewerten (eine kann den Anfang verloren haben)
    const allNames = new Set(first.names);
    const allLate = new Set(first.late);
    const attempts: Array<[Quad, boolean]> = [];
    if (alt) attempts.push([alt, false]);
    if (extra) attempts.push([extra, false]);
    if (dim) attempts.push([quad, true]);
    if (dim && extra) attempts.push([extra, true]);
    for (const [q, brighten] of attempts) {
      const more = await readName(source, w, h, q, worker, brighten);
      more.names.forEach((n) => allNames.add(n));
      more.late.forEach((n) => allLate.add(n));
      read = judge(Array.from(allNames), dictionary, allLate);
      if (read.sure) return read;
    }
    // Vermutlich keine englische Karte: Es wurde etwas gelesen, aber kein
    // englischer Kartenname passt gut. Dann mit dem deutschen
    // Modell nachlesen (Umlaute, deutsche Wörter); der Server löst deutsche
    // Namen auf. Auf die Sprachangabe der Infozeile ist kein Verlass – auf
    // vielen Karten steht keine.
    // Deutsches Wörterbuch auf dem Gerät: Auch das englische Lesemodell
    // liest deutsche Namen oft gut genug ("Schildkrotenformation").
    const lateAll = allLate;
    const viaGerman = (names: string[], late: Set<string>): NameRead | null => {
      if (!german) return null;
      const de = judge(names, german.index, late).sure;
      const en = de ? englishFor(german, de.name) : null;
      // nur, wenn der deutsche Name klar besser passt als jeder englische
      const guess = bestGuess(read, dictionary);
      return de && en && (!guess || de.score > guess.score) ? { ...read, sure: { name: en, score: de.score, confident: true }, germanName: de.name } : null;
    };
    const direct = viaGerman(read.names, lateAll);
    if (direct) return direct;
    // Schalter "Deutsch": Die Lesung stammt schon vom deutschen Modell
    if (germanFirst) return read.names.length ? { ...read, german: read.names } : read;
    const foreign = (await info.catch(() => null))?.lang;
    // Auch bei nur mäßig passendem englischem Namen: Deutsche Wörter ähneln
    // manchmal zufällig einem englischen Kartennamen.
    const guess = bestGuess(read, dictionary);
    if ((read.names.length && (!guess || guess.score < GERMAN_BELOW)) || (foreign && foreign !== "EN")) {
      const reread = await readName(source, w, h, quad, await getGermanWorker()).catch(() => null);
      if (reread?.names.length) return viaGerman(reread.names, reread.late) ?? { ...read, german: reread.names };
    }
    return read;
  })();

  return { quad: found ? quad : null, name, info };
}
