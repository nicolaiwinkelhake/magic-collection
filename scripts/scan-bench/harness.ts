// Messstand für den Scanner (läuft im Browser, gesteuert von run.mjs):
// baut aus einem Kartenbild ein künstliches Kamerabild (Tisch, Schräglage,
// Unschärfe, Spiegelung …) und schickt es durch dieselbe Kette wie die App.
import { detectCard } from "@/lib/cardDetect";
import { grayOf } from "@/lib/printHashClient";
import { coverGuide, type Rect } from "@/lib/scanGeometry";
import { DETECT_W, INFO_AREA, NAME_AREA, NAME_QUAD_AREA, NAME_QUAD_HEIGHT, ocrLines, regionToCanvas, subArea, warpToCanvas } from "@/lib/scanRead";
import { detectQuad, type Quad } from "@/lib/cardQuad";
import { nameCandidates, parseCardInfo } from "@/lib/ocr";
import { matchName, type NameMatch } from "@/lib/nameIndex";
import { getInfoWorker } from "@/lib/ocrEngine";
import type { Worker } from "tesseract.js";
import { buildNameIndex, type NameIndex } from "@/lib/nameIndex";
import { warmUp } from "@/lib/ocrEngine";
import { buildGermanIndex, type GermanIndex } from "@/lib/germanIndex";
import { bestGuess, recognizeFrame } from "@/lib/scanRecognize";
import { printMatchesRead } from "@/lib/scryfallDirect";
import { nameSimilarity } from "@/lib/textSimilarity";

export type Condition = {
  /** Kartenbreite relativ zum Hilfsrahmen (1 = füllt ihn genau) */
  scale: [number, number];
  /** Versatz relativ zur Rahmenbreite */
  offset: number;
  /** Drehung in Grad (±) */
  rot: number;
  blur: [number, number];
  brightness: [number, number];
  noise: number;
  glare: number; // Wahrscheinlichkeit
  /** Kippen: Stauchung einer Achse (1 = keine) */
  squash: number;
};

const W = 1080;
const H = 1920;
let index: NameIndex | null = null;
const xw: Record<string, Promise<Worker>> = {};
let prior: Map<string, number> = new Map();
let german: GermanIndex | null = null;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, [a, b]: [number, number]) => a + (b - a) * r();

function background(ctx: CanvasRenderingContext2D, r: () => number) {
  const kind = Math.floor(r() * 4);
  if (kind === 0) {
    // Holztisch mit Maserung
    ctx.fillStyle = "#8a6238";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${40 + r() * 60},${25 + r() * 40},${10 + r() * 20},${0.08 + r() * 0.2})`;
      ctx.fillRect(r() * W, 0, 2 + r() * 14, H);
    }
  } else if (kind === 1) {
    ctx.fillStyle = "#1c1c20";
    ctx.fillRect(0, 0, W, H);
  } else if (kind === 2) {
    ctx.fillStyle = "#d9d6cf";
    ctx.fillRect(0, 0, W, H);
  } else {
    // Spielmatte: Farbverlauf mit Flecken
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#27406b");
    g.addColorStop(1, "#5a2b5e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${r() * 255},${r() * 255},${r() * 255},0.08)`;
      ctx.beginPath();
      ctx.arc(r() * W, r() * H, 30 + r() * 160, 0, 7);
      ctx.fill();
    }
  }
}

function compose(img: HTMLImageElement, cond: Condition, seed: number, shot = 0): { frame: HTMLCanvasElement; truth: Rect; guide: Rect; corners: Quad } {
  const r = rng(seed);
  const guide = coverGuide(W, H, 390, 693).video;
  const scene = document.createElement("canvas");
  scene.width = W;
  scene.height = H;
  const ctx = scene.getContext("2d")!;
  background(ctx, r);
  const scale = between(r, cond.scale);
  const cw = guide.w * W * scale;
  const ch = cw * (88 / 63);
  const cx = (guide.x + guide.w / 2) * W + (r() * 2 - 1) * cond.offset * guide.w * W;
  const cy = (guide.y + guide.h / 2) * H + (r() * 2 - 1) * cond.offset * guide.w * W;
  const rot = ((r() * 2 - 1) * cond.rot * Math.PI) / 180;
  const sq = 1 - r() * (1 - cond.squash);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(1, sq);
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  const rad = cw * 0.0475;
  ctx.beginPath();
  ctx.roundRect(-cw / 2, -ch / 2, cw, ch, rad);
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.clip();
  ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
  // Kamera-Zufall je Aufnahme (zweites Bild derselben Lage: anderes Rauschen, andere Spiegelung)
  const k = rng(seed * 31 + 17 + shot * 101);
  if (k() < cond.glare) {
    // Spiegelung (Lampe/Hülle): heller Fleck irgendwo auf der Karte
    const gx = (k() - 0.5) * cw;
    const gy = (k() - 0.5) * ch;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, cw * (0.25 + k() * 0.3));
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
  }
  ctx.restore();

  // Kamera: Unschärfe, Helligkeit, Rauschen
  const frame = document.createElement("canvas");
  frame.width = W;
  frame.height = H;
  const fctx = frame.getContext("2d", { willReadFrequently: true })!;
  fctx.filter = `blur(${between(k, cond.blur).toFixed(2)}px) brightness(${between(k, cond.brightness).toFixed(2)})`;
  fctx.drawImage(scene, 0, 0);
  fctx.filter = "none";
  if (cond.noise > 0) {
    const d = fctx.getImageData(0, 0, W, H);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = (k() + k() + k() - 1.5) * cond.noise;
      d.data[i] += n;
      d.data[i + 1] += n;
      d.data[i + 2] += n;
    }
    fctx.putImageData(d, 0, 0);
  }
  const hh = ch * sq;
  const corner = (u: number, v: number) => ({
    x: (cx + (u - 0.5) * cw * Math.cos(rot) - (v - 0.5) * hh * Math.sin(rot)) / W,
    y: (cy + (u - 0.5) * cw * Math.sin(rot) + (v - 0.5) * hh * Math.cos(rot)) / H,
  });
  const corners: Quad = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
  return { frame, corners, truth: { x: (cx - cw / 2) / W, y: (cy - hh / 2) / H, w: cw / W, h: hh / H }, guide };
}

// Graustufen + Kontrast zwischen zwei Perzentilen strecken (robust gegen Rauschen/Glanzpunkte)
function stretch(d: Uint8ClampedArray, lo: number, hi: number) {
  const hist = new Uint32Array(256);
  const n = d.length / 4;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g;
    hist[g]++;
    sum += g;
  }
  let acc = 0;
  let a = 0;
  let b = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc < n * lo) a = v;
    if (acc < n * hi) b = v;
  }
  const inv = sum / n < 110;
  const range = Math.max(1, b - a);
  for (let i = 0; i < d.length; i += 4) {
    let v = Math.max(0, Math.min(255, ((d[i] - a) / range) * 255));
    if (inv) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

function iou(a: Rect, b: Rect) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

const api = {
  async init(names: string[], sets: Array<[string, number]> = [], de: Array<[string, string]> = []) {
    prior = new Map(sets);
    german = de.length ? buildGermanIndex(de) : null;
    index = buildNameIndex(names);
    await warmUp();
  },
  async run(url: string, cond: Condition, seed: number, trueName: string) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { frame, truth, guide, corners } = compose(img, cond, seed);
    const dh = Math.round((DETECT_W * H) / W);
    // wie in der App: die einfache Rechtecksuche läuft im Takt mit und dient als Ersatz
    const rect = detectCard(grayOf(frame, 0, 0, W, H, DETECT_W, dh), DETECT_W, dh);
    const t0 = performance.now();
    const read = recognizeFrame(frame, W, H, { x: 0, y: 0, w: 1, h: 1 }, rect ?? guide, index, prior, false, german);
    const t1 = performance.now();
    const name = await read.name;
    const t2 = performance.now();
    const info = await read.info;
    const t3 = performance.now();
    const cornerErr = read.quad ? Math.max(...read.quad.map((p, i) => Math.hypot((p.x - corners[i].x) * W, (p.y - corners[i].y) * H))) / (truth.w * W) : -1;
    // Wie die Automatik der App mit unsicheren Namen umgeht (ohne Netz nachgestellt):
    // - Set + Nummer gelesen → Karte bekannt; angenommen, wenn ihr Name zum Gelesenen passt
    // - sonst unscharfe Suche mit dem gelesenen Text; Treffer nur bei Ähnlichkeit ≥ 0,8
    const guess = bestGuess(name, index);
    const printCheck = printMatchesRead([...name.names, ...(guess ? [guess.name] : [])], [trueName], 0.5, true);
    const fuzzy = name.names.slice(0, 2).map((raw) => {
      // Scryfalls unscharfe Suche liefert (höchstens) den ähnlichsten Namen
      const m = index ? matchName(index, raw) : null;
      return m && Math.max(nameSimilarity(raw, m.name), nameSimilarity(raw, m.name.split(" // ")[0])) >= 0.8 ? m.name : null;
    });
    return { detected: !!read.quad, cornerErr, quadMs: t1 - t0, nameMs: t2 - t0, totalMs: t3 - t0, ...name, info, printCheck, fuzzy: fuzzy.find(Boolean) ?? null };
  },
  /** Versuche: Ausschnitt/Größe/Sprache frei wählbar (zum Vergleichen von Varianten) */
  async experiment(url: string, cond: Condition, seed: number, o: { rect: "truth" | "detect" | "quad" | "truthquad"; quadW?: number; nameH: number; infoH: number; langs: string; nameArea?: Rect; infoArea?: Rect; pre?: string; infoPre?: string; psm?: string }) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { frame, truth, guide, corners } = compose(img, cond, seed);
    const dh = Math.round((DETECT_W * H) / W);
    const found = o.rect === "truth" ? truth : detectCard(grayOf(frame, 0, 0, W, H, DETECT_W, dh), DETECT_W, dh) ?? guide;
    const key = o.langs + (o.psm ?? "7");
    xw[key] ??= (async () => {
      const { createWorker, OEM } = await import("tesseract.js");
      const w = await createWorker(o.langs.split("+"), OEM.LSTM_ONLY, { workerPath: "/ocr/5.1.1/worker.min.js", corePath: "/ocr/5.1.1", langPath: "/ocr/5.1.1/lang", gzip: true });
      await w.setParameters({ tessedit_pageseg_mode: (o.psm ?? "7") as never });
      return w;
    })();
    const worker = await xw[key];
    let nc: HTMLCanvasElement;
    let ic: HTMLCanvasElement;
    let cornerErr = -1;
    let quadMs = 0;
    if (o.rect === "quad" || o.rect === "truthquad") {
      const qw = o.quadW ?? 180;
      const qh = Math.round((qw * H) / W);
      const tq = performance.now();
      const dq = o.rect === "quad" ? detectQuad(grayOf(frame, 0, 0, W, H, qw, qh), qw, qh) : null;
      quadMs = performance.now() - tq;
      const quad: Quad = o.rect === "truthquad" ? corners : dq ? (dq.map((p) => ({ x: p.x / qw, y: p.y / qh })) as Quad) : [{ x: guide.x, y: guide.y }, { x: guide.x + guide.w, y: guide.y }, { x: guide.x + guide.w, y: guide.y + guide.h }, { x: guide.x, y: guide.y + guide.h }];
      cornerErr = dq || o.rect === "truthquad" ? Math.max(...quad.map((p, i) => Math.hypot((p.x - corners[i].x) * W, (p.y - corners[i].y) * H))) / (truth.w * W) : -1;
      const pre =
        o.pre === "raw"
          ? () => {}
          : o.pre === "pct"
            ? (d: Uint8ClampedArray) => stretch(d, 0.03, 0.97)
            : undefined;
      nc = warpToCanvas(frame, W, H, quad, o.nameArea ?? NAME_AREA, o.nameH, pre);
      ic = warpToCanvas(frame, W, H, quad, o.infoArea ?? INFO_AREA, o.infoH, o.infoPre === "raw" ? () => {} : o.infoPre === "pct" ? (d: Uint8ClampedArray) => stretch(d, 0.03, 0.97) : undefined);
    } else {
      const n = subArea(found, o.nameArea ?? NAME_AREA, W, H);
      const a = subArea(found, o.infoArea ?? INFO_AREA, W, H);
      nc = regionToCanvas(frame, n.sx, n.sy, n.sw, n.sh, o.nameH);
      ic = regionToCanvas(frame, a.sx, a.sy, a.sw, a.sh, o.infoH);
    }
    const t0 = performance.now();
    const nameLines = await ocrLines(nc, worker);
    const t1 = performance.now();
    const infoLines = await ocrLines(ic, await getInfoWorker());
    const t2 = performance.now();
    const names = nameCandidates(nameLines);
    const hits = names.map((x) => matchName(index!, x)).filter(Boolean) as NameMatch[];
    const info = parseCardInfo(infoLines.map((l) => l.text).join("\n"), prior);
    return { names, sure: hits.find((m) => m.confident) ?? null, best: hits[0] ?? null, info, infoRaw: infoLines.map((l) => l.text).join(" | "), nameMs: t1 - t0, infoMs: t2 - t1, cornerErr, quadMs, nameImg: o.pre === "dump" ? nc.toDataURL() : undefined, infoImg: o.pre === "dump" ? ic.toDataURL() : undefined };
  },
  crop(url: string, cond: Condition, seed: number, area: Rect, hh: number) {
    return (async () => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const { frame, truth } = compose(img, cond, seed);
      const n = subArea(truth, area, W, H);
      return regionToCanvas(frame, n.sx, n.sy, n.sw, n.sh, hh).toDataURL("image/png");
    })();
  },
  /** Fertiges Kamerabild prüfen: Viereck + gelesene Ausschnitte (zum Ansehen) */
  async frameCheck(url: string) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const qw = 180;
    const qh = Math.round((qw * h) / w);
    const found = detectQuad(grayOf(img, 0, 0, w, h, qw, qh), qw, qh);
    if (!found) return { quad: null };
    const quad = found.map((p) => ({ x: p.x / qw, y: p.y / qh })) as Quad;
    const read = recognizeFrame(img, w, h, { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }, index, prior);
    return { quad, name: warpToCanvas(img, w, h, quad, NAME_QUAD_AREA, NAME_QUAD_HEIGHT, () => {}).toDataURL(), info: warpToCanvas(img, w, h, quad, INFO_AREA, 72).toDataURL(), names: (await read.name).names, infoRead: await read.info };
  },
  /** Bild der Szene (zum Ansehen) */
  async preview(url: string, cond: Condition, seed: number) {
    const img = new Image();
    img.src = url;
    await img.decode();
    return compose(img, cond, seed).frame.toDataURL("image/jpeg", 0.8);
  },
};
(window as unknown as { bench: typeof api }).bench = api;
