// Karte im Kamerabild finden (rein, getestet) – ohne Bibliothek.
// Arbeitet auf einem kleinen Graustufenbild (z. B. 120×210). Eine Karte hat
// vier gerade Kanten (Rand gegen Hintergrund) im Format 63×88 mm.
//
// Vorgehen:
// 1) Kantenstärke je Pixel (waagerechte/senkrechte Helligkeitssprünge).
// 2) Spalten-/Zeilensummen → die stärksten Kandidaten für senkrechte und
//    waagerechte Linien (mit Abstand zueinander).
// 3) Jede Kombination links/rechts/oben/unten im Kartenformat bewerten: Auf
//    welchem Anteil ihres Stücks ist jede der vier Kanten wirklich vorhanden
//    (nicht über das ganze Bild)? Maßgeblich ist die schwächste Kante – alle
//    vier müssen da sein. Linien im Hintergrund (Tischkante, Maserung) laufen über das
//    ganze Bild und bilden kein passendes Rechteck.
// Grenze: Die Karte sollte ungefähr gerade liegen (bis ca. 10° schief).

export type Rect = { x: number; y: number; w: number; h: number }; // relativ 0–1

const CARD_RATIO = 63 / 88;
// Kandidaten je Richtung (×2): genug, damit die Kartenkante auch zwischen
// vielen Hintergrundlinien (Maserung) dabei ist
const PEAKS = 14;

function topPeaks(profile: Float32Array, from: number, to: number, k: number, minGap: number): number[] {
  const idx = Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i).sort((a, b) => profile[b] - profile[a]);
  const out: number[] = [];
  for (const i of idx) {
    if (out.every((j) => Math.abs(j - i) >= minGap)) out.push(i);
    if (out.length >= k) break;
  }
  return out;
}

export function detectCard(gray: Float32Array, w: number, h: number): Rect | null {
  if (w < 8 || h < 8) return null;
  // Kantenstärke; Präfixsummen für schnelle Mittelwerte auf Kantenstücken
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = Math.abs(gray[i + 1] - gray[i - 1]);
      gy[i] = Math.abs(gray[i + w] - gray[i - w]);
    }
  }
  // typische Kantenstärke im Bild → Schwelle "hier ist eine Kante"
  let gsum = 0;
  for (let i = 0; i < gx.length; i++) gsum += gx[i] + gy[i];
  const meanGrad = gsum / (2 * gx.length);
  const edgeThr = Math.max(18, meanGrad * 2.5);

  // Abdeckung statt Stärke: Anteil der Pixel auf einem Kantenstück, die
  // wirklich Kante sind. Präfixsummen über 0/1-Kantenkarten:
  // colPS[x*(h+1)+y] = Anzahl Kantenpixel (x, 0..y-1), rowPS analog je Zeile.
  const colPS = new Float32Array(w * (h + 1));
  const rowPS = new Float32Array(h * (w + 1));
  const cols = new Float32Array(w);
  const rows = new Float32Array(h);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y < h; y++) {
      acc += gx[y * w + x] > edgeThr ? 1 : 0;
      colPS[x * (h + 1) + y + 1] = acc;
      cols[x] += gx[y * w + x];
    }
  }
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = 0; x < w; x++) {
      acc += gy[y * w + x] > edgeThr ? 1 : 0;
      rowPS[y * (w + 1) + x + 1] = acc;
      rows[y] += gy[y * w + x];
    }
  }
  const vSeg = (x: number, y0: number, y1: number) => {
    let best = 0;
    for (let xx = Math.max(1, x - 1); xx <= Math.min(w - 2, x + 1); xx++) {
      const s = colPS[xx * (h + 1) + y1] - colPS[xx * (h + 1) + y0];
      if (s > best) best = s;
    }
    return best / Math.max(1, y1 - y0);
  };
  const hSeg = (y: number, x0: number, x1: number) => {
    let best = 0;
    for (let yy = Math.max(1, y - 1); yy <= Math.min(h - 2, y + 1); yy++) {
      const s = rowPS[yy * (w + 1) + x1] - rowPS[yy * (w + 1) + x0];
      if (s > best) best = s;
    }
    return best / Math.max(1, x1 - x0);
  };

  const xs = topPeaks(cols, 1, w - 1, PEAKS * 2, 3).sort((a, b) => a - b);
  const ys = topPeaks(rows, 1, h - 1, PEAKS * 2, 3).sort((a, b) => a - b);

  const found: Array<{ score: number; l: number; r: number; t: number; b: number }> = [];
  for (let a = 0; a < xs.length; a++) {
    for (let bb = a + 1; bb < xs.length; bb++) {
      const l = xs[a];
      const r = xs[bb];
      const cw = r - l;
      if (cw < w * 0.25) continue;
      for (let c = 0; c < ys.length; c++) {
        for (let d = c + 1; d < ys.length; d++) {
          const t = ys[c];
          const b = ys[d];
          const ch = b - t;
          if (ch < h * 0.3) continue;
          const ratio = cw / ch;
          if (ratio < CARD_RATIO * 0.85 || ratio > CARD_RATIO * 1.15) continue;
          // Kanten auf ihrem ganzen Stück messen (nur die runden Ecken
          // knapp ausgespart) – sonst würde ein zu großes Rechteck, das über
          // die Karte hinausreicht, nicht auffallen.
          const my = 2;
          const mx = 2;
          const score = Math.min(
            vSeg(l, t + my, b - my),
            vSeg(r, t + my, b - my),
            hSeg(t, l + mx, r - mx),
            hSeg(b, l + mx, r - mx),
          );
          found.push({ score, l, r, t, b });
        }
      }
    }
  }
  if (!found.length) return null;
  // Alle vier Kanten müssen fast durchgehend vorhanden sein
  const top = Math.max(...found.map((f) => f.score));
  if (top < 0.7) return null;
  // Unter den (fast) besten Rechtecken das größte: Innerhalb der Karte gibt
  // es oft weitere vollständige Kanten (helle Felder auf dunklem Rand) –
  // gesucht ist der äußere Kartenrand. Rechtecke, die über die Karte hinaus
  // reichen, verlieren Abdeckung an den Seiten und fallen heraus.
  const good = found.filter((f) => f.score >= top - 0.02);
  const best = good.reduce((a, f) => ((f.r - f.l) * (f.b - f.t) > (a.r - a.l) * (a.b - a.t) ? f : a));
  return { x: best.l / w, y: best.t / h, w: (best.r - best.l) / w, h: (best.b - best.t) / h };
}
