// Karte als Viereck im Kamerabild finden und entzerren (rein, getestet).
// Anders als die einfache Rechtecksuche (cardDetect) verträgt das schräg
// liegende und leicht gekippte Karten: Für jede der vier Seiten wird die
// beste Gerade (Lage + Winkel) gesucht, dann die Kombination gewählt, die
// ein Viereck im Kartenformat ergibt.
//
// Besonderheit: Auf dunklem Untergrund ist der schwarze Kartenrand kaum zu
// sehen – gefunden wird dann der innere Rahmen. Das wird erkannt (dunkler,
// gleichmäßiger Streifen außen herum) und auf den Kartenrand hochgerechnet.

import { prepareForEdges } from "@/lib/grayLevels";

export type Pt = { x: number; y: number };
/** Ecken in Pixeln des Suchbilds: oben links, oben rechts, unten rechts, unten links */
export type Quad = [Pt, Pt, Pt, Pt];

const CARD_RATIO = 63 / 88;
const ANGLES = [-9, -7.5, -6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6, 7.5, 9].map((d) => (d * Math.PI) / 180);
const TOP_K = 7;

type Line = { c: number; t: number; score: number }; // Lage in Bildmitte, tan(Winkel)

/** Schnittpunkt einer fast senkrechten (x = cv + tv·(y − h/2)) mit einer fast waagerechten Linie (y = ch + th·(x − w/2)). */
function cross(v: Line, hl: Line, w: number, h: number): Pt {
  // x = cv + tv*(y - h/2); y = ch + th*(x - w/2)
  const y = (hl.c + hl.t * (v.c - v.t * (h / 2) - w / 2)) / (1 - hl.t * v.t);
  return { x: v.c + v.t * (y - h / 2), y };
}

/** Karte als Viereck; `alt` ist die zweite Lesart (innerer Rahmen ↔ Kartenrand), falls die erste nicht passt. */
export function detectQuadBoth(input: Float32Array, w: number, h: number, enhance = false): { quad: Quad; alt: Quad | null } | null {
  if (w < 24 || h < 24) return null;
  // `enhance`: flaues Bild (wenig Licht, dunkle Karte) geglättet und gestreckt – als Zusatzversuch
  const gray = enhance ? prepareForEdges(input, w, h) : input;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  let gsum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = Math.abs(gray[i + 1] - gray[i - 1]);
      gy[i] = Math.abs(gray[i + w] - gray[i - w]);
      gsum += gx[i] + gy[i];
    }
  }
  const thr = Math.max(14, (gsum / (2 * w * h)) * 2.2);
  // Kantenkarten (0/1), 1 Pixel verbreitert – verzeiht Rundung bei schrägen Linien
  const ex = new Uint8Array(w * h);
  const ey = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (gx[i] > thr || gx[i - 1] > thr || gx[i + 1] > thr) ex[i] = 1;
      if (gy[i] > thr || gy[i - w] > thr || gy[i + w] > thr) ey[i] = 1;
    }
  }
  // Abdeckung einer fast senkrechten Linie zwischen y0 und y1.
  // `sharp`: Summe der Kantenstärke genau auf der Linie (zum Feineinpassen
  // des Winkels – die verbreiterte Karte wäre dafür zu nachsichtig).
  const vCover = (c: number, t: number, y0: number, y1: number, sharp = false) => {
    let hit = 0;
    let n = 0;
    for (let y = Math.max(1, Math.ceil(y0)); y < Math.min(h - 1, y1); y++) {
      const x = Math.round(c + t * (y - h / 2));
      if (x < 1 || x >= w - 1) continue;
      n++;
      hit += sharp ? Math.min(gx[y * w + x], thr * 3) / (thr * 3) : ex[y * w + x];
    }
    return n >= 8 ? hit / (y1 - y0) : 0;
  };
  const hCover = (c: number, t: number, x0: number, x1: number, sharp = false) => {
    let hit = 0;
    let n = 0;
    for (let x = Math.max(1, Math.ceil(x0)); x < Math.min(w - 1, x1); x++) {
      const y = Math.round(c + t * (x - w / 2));
      if (y < 1 || y >= h - 1) continue;
      n++;
      hit += sharp ? Math.min(gy[y * w + x], thr * 3) / (thr * 3) : ey[y * w + x];
    }
    return n >= 8 ? hit / (x1 - x0) : 0;
  };
  // Kandidaten je Seite: beste Linien, mit Abstand zueinander
  const pick = (all: Line[], minGap: number): Line[] => {
    all.sort((a, b) => b.score - a.score);
    const out: Line[] = [];
    for (const l of all) {
      if (l.score < 0.35) break;
      if (out.every((o) => Math.abs(o.c - l.c) >= minGap)) out.push(l);
      if (out.length >= TOP_K) break;
    }
    return out;
  };
  // Linie um ihre Lage herum genauer einpassen (¼°-Schritte, ½ Pixel)
  const refine = (line: Line, cover: (c: number, t: number, a: number, z: number, sharp?: boolean) => number, a: number, z: number): Line => {
    let bestLine = line;
    let bestSharp = cover(line.c, line.t, a, z, true);
    for (let dt = -0.039; dt <= 0.0391; dt += 0.0065)
      for (let dc = -1.5; dc <= 1.5; dc += 0.5) {
        const sc = cover(line.c + dc, line.t + dt, a, z, true);
        if (sc > bestSharp + 1e-6) {
          bestSharp = sc;
          bestLine = { c: line.c + dc, t: line.t + dt, score: line.score };
        }
      }
    return { ...bestLine, score: cover(bestLine.c, bestLine.t, a, z) };
  };
  const vLines = (from: number, to: number) => {
    const all: Line[] = [];
    for (let c = from; c < to; c++) for (const a of ANGLES) all.push({ c, t: Math.tan(a), score: vCover(c, Math.tan(a), h * 0.3, h * 0.7) });
    return pick(all, 3).map((l) => refine(l, vCover, h * 0.25, h * 0.75));
  };
  const hLines = (from: number, to: number) => {
    const all: Line[] = [];
    for (let c = from; c < to; c++) for (const a of ANGLES) all.push({ c, t: Math.tan(a), score: hCover(c, Math.tan(a), w * 0.35, w * 0.65) });
    return pick(all, 3).map((l) => refine(l, hCover, w * 0.3, w * 0.7));
  };
  const L = vLines(1, Math.floor(w * 0.5));
  const R = vLines(Math.ceil(w * 0.5), w - 1);
  const T = hLines(1, Math.floor(h * 0.5));
  const B = hLines(Math.ceil(h * 0.5), h - 1);

  type Cand = { quad: Quad; score: number; area: number; lines: [Line, Line, Line, Line] };
  let best: Cand | null = null;
  const cands: Cand[] = [];
  for (const l of L)
    for (const r of R) {
      if (Math.abs(l.t - r.t) > 0.07) continue;
      for (const t of T)
        for (const b of B) {
          if (Math.abs(t.t - b.t) > 0.07) continue;
          // rechte Winkel: waagerechte Linie dreht gegenläufig zur senkrechten
          if (Math.abs(t.t + l.t) > 0.09 && Math.abs(b.t + r.t) > 0.09) continue;
          const tl = cross(l, t, w, h);
          const tr = cross(r, t, w, h);
          const br = cross(r, b, w, h);
          const bl = cross(l, b, w, h);
          const cw = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2;
          const ch = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2;
          if (cw < w * 0.22 || ch < h * 0.22) continue;
          const ratio = cw / ch;
          if (ratio < CARD_RATIO * 0.9 || ratio > CARD_RATIO * 1.2) continue;
          // jede Kante auf ihrem ganzen Stück (ohne die runden Ecken)
          const my = ch * 0.07;
          const mx = cw * 0.07;
          const score = Math.min(
            vCover(l.c, l.t, Math.min(tl.y, tr.y) + my, Math.max(bl.y, br.y) - my),
            vCover(r.c, r.t, Math.min(tl.y, tr.y) + my, Math.max(bl.y, br.y) - my),
            hCover(t.c, t.t, Math.min(tl.x, bl.x) + mx, Math.max(tr.x, br.x) - mx),
            hCover(b.c, b.t, Math.min(tl.x, bl.x) + mx, Math.max(tr.x, br.x) - mx),
          );
          const cand = { quad: [tl, tr, br, bl] as Quad, score, area: cw * ch, lines: [l, r, t, b] as [Line, Line, Line, Line] };
          cands.push(cand);
          if (!best || score > best.score) best = cand;
        }
    }
  if (!best || best.score < 0.62) return null;
  // Unter den (fast) besten das größte: gesucht ist der äußere Kartenrand
  const top = best.score;
  const outer = cands.filter((c) => c.score >= top - 0.1).reduce((a, c) => (c.area > a.area ? c : a));
  // Feinschliff: jede Seite um ihre Lage herum genauer einpassen (½°, ½ Pixel)
  let [l, r, t, b] = outer.lines;
  let q = outer.quad;
  for (let pass = 0; pass < 2; pass++) {
    const y0 = Math.min(q[0].y, q[1].y) + (q[3].y - q[0].y) * 0.07;
    const y1 = Math.max(q[2].y, q[3].y) - (q[3].y - q[0].y) * 0.07;
    const x0 = Math.min(q[0].x, q[3].x) + (q[1].x - q[0].x) * 0.07;
    const x1 = Math.max(q[1].x, q[2].x) - (q[1].x - q[0].x) * 0.07;
    l = refine(l, vCover, y0, y1);
    r = refine(r, vCover, y0, y1);
    t = refine(t, hCover, x0, x1);
    b = refine(b, hCover, x0, x1);
    q = [cross(l, t, w, h), cross(r, t, w, h), cross(r, b, w, h), cross(l, b, w, h)];
  }
  return expandIfInnerFrame(gray, w, h, q);
}

export function detectQuad(gray: Float32Array, w: number, h: number): Quad | null {
  return detectQuadBoth(gray, w, h)?.quad ?? null;
}

/** Punkt im Viereck: u,v ∈ 0–1 (bilinear – für kleine Verzerrungen genau genug) */
export function quadPoint(q: Quad, u: number, v: number): Pt {
  const tx = q[0].x + (q[1].x - q[0].x) * u;
  const ty = q[0].y + (q[1].y - q[0].y) * u;
  const bx = q[3].x + (q[2].x - q[3].x) * u;
  const by = q[3].y + (q[2].y - q[3].y) * u;
  return { x: tx + (bx - tx) * v, y: ty + (by - ty) * v };
}

// Innerer Rahmen einer Karte (moderne Rahmen): schwarzer Rand außen
// links/rechts ≈ 4,6 % der Kartenbreite, oben ≈ 3,6 %, unten ≈ 7,2 % der Höhe
// (dort steht die Infozeile).
const INNER = { l: 0.046, r: 0.046, t: 0.036, b: 0.072 };

function expandIfInnerFrame(gray: Float32Array, w: number, h: number, q: Quad): { quad: Quad; alt: Quad | null } {
  const iw = 1 - INNER.l - INNER.r;
  const ih = 1 - INNER.t - INNER.b;
  // Viereck in "inneren" Koordinaten nach außen fortsetzen
  const ext = (u: number, v: number) => quadPoint(q, (u - INNER.l) / iw, (v - INNER.t) / ih);
  const grown: Quad = [ext(0, 0), ext(1, 0), ext(1, 1), ext(0, 1)];
  if (grown.some((p) => p.x < 0 || p.y < 0 || p.x > w - 1 || p.y > h - 1)) return { quad: q, alt: null };
  // Streifen zwischen innen und außen: dunkel und gleichmäßig?
  let sum = 0;
  let sq = 0;
  let n = 0;
  let inner = 0;
  let ni = 0;
  const sample = (u: number, v: number) => {
    const p = ext(u, v);
    return gray[Math.round(p.y) * w + Math.round(p.x)];
  };
  for (let k = 0.08; k <= 0.92; k += 0.04) {
    for (const [u, v] of [
      [INNER.l * 0.5, k],
      [1 - INNER.r * 0.5, k],
      [k, INNER.t * 0.5],
    ] as const) {
      const g = sample(u, v);
      sum += g;
      sq += g * g;
      n++;
    }
    // Vergleich: knapp innerhalb des gefundenen Vierecks
    for (const [u, v] of [
      [INNER.l + 0.03, k],
      [1 - INNER.r - 0.03, k],
    ] as const) {
      inner += sample(u, v);
      ni++;
    }
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  // dunkler Rand: deutlich dunkler als das Karteninnere und ohne Struktur
  return mean < 70 && sd < 16 && mean < inner / ni - 12 ? { quad: grown, alt: q } : { quad: q, alt: grown };
}

/** Achsenparalleles Rechteck um das Viereck, relativ 0–1 */
export function quadBounds(q: Quad, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const x0 = Math.max(0, Math.min(...xs));
  const y0 = Math.max(0, Math.min(...ys));
  return { x: x0 / w, y: y0 / h, w: (Math.min(w, Math.max(...xs)) - x0) / w, h: (Math.min(h, Math.max(...ys)) - y0) / h };
}

/**
 * Bereich einer Karte entzerrt herausrechnen: `area` relativ zur Karte
 * (0–1), Ergebnis als Graustufen outW×outH. `src` ist ein RGBA-Bild, `q` das
 * Viereck der Karte in dessen Pixeln.
 */
export function warpArea(
  src: { data: Uint8ClampedArray; width: number; height: number },
  q: Quad,
  area: { x: number; y: number; w: number; h: number },
  outW: number,
  outH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width, height } = src;
  for (let j = 0; j < outH; j++) {
    const v = area.y + ((j + 0.5) / outH) * area.h;
    for (let i = 0; i < outW; i++) {
      const u = area.x + ((i + 0.5) / outW) * area.w;
      const p = quadPoint(q, u, v);
      const x = Math.min(width - 1.001, Math.max(0, p.x));
      const y = Math.min(height - 1.001, Math.max(0, p.y));
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const a = (y0 * width + x0) * 4;
      const b = a + 4;
      const c = a + width * 4;
      const d = c + 4;
      const o = (j * outW + i) * 4;
      for (let k = 0; k < 3; k++) {
        out[o + k] = (data[a + k] * (1 - fx) + data[b + k] * fx) * (1 - fy) + (data[c + k] * (1 - fx) + data[d + k] * fx) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
