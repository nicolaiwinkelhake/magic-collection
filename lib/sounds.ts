// Kurze Töne in der App, ohne Audiodateien (Web Audio). Je Mitteilungsart
// eine eigene kleine Melodie; abschaltbar in den Einstellungen.
import { fxEnabled } from "@/lib/fxSettings";
import type { PushKind } from "@/lib/pushMessages";

export type Chime = PushKind | "success" | "error";

/** Töne (Frequenz in Hz, Start und Länge in s) je Melodie (rein). */
export function chimeNotes(kind: Chime): { f: number; at: number; len: number }[] {
  switch (kind) {
    case "trades": // aufsteigender Dreiklang – „Deal!“
      return [
        { f: 659, at: 0, len: 0.12 },
        { f: 784, at: 0.1, len: 0.12 },
        { f: 1047, at: 0.2, len: 0.22 },
      ];
    case "friends": // zwei warme Töne
      return [
        { f: 523, at: 0, len: 0.14 },
        { f: 784, at: 0.13, len: 0.24 },
      ];
    case "shares": // Glitzer
      return [
        { f: 1175, at: 0, len: 0.08 },
        { f: 1397, at: 0.07, len: 0.08 },
        { f: 1760, at: 0.14, len: 0.16 },
      ];
    case "wishlist": // kleine Fanfare
      return [
        { f: 784, at: 0, len: 0.1 },
        { f: 988, at: 0.09, len: 0.1 },
        { f: 1175, at: 0.18, len: 0.1 },
        { f: 1568, at: 0.27, len: 0.22 },
      ];
    case "prices": // Münzen
      return [
        { f: 1319, at: 0, len: 0.06 },
        { f: 1976, at: 0.06, len: 0.18 },
      ];
    case "loans":
      return [
        { f: 784, at: 0, len: 0.12 },
        { f: 659, at: 0.12, len: 0.2 },
      ];
    case "success":
      return [
        { f: 880, at: 0, len: 0.08 },
        { f: 1319, at: 0.08, len: 0.14 },
      ];
    case "error":
      return [
        { f: 330, at: 0, len: 0.12 },
        { f: 247, at: 0.12, len: 0.2 },
      ];
  }
}

let ctx: AudioContext | null = null;

export function chime(kind: Chime) {
  if (!fxEnabled("sounds")) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    for (const n of chimeNotes(kind)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(0.0001, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + n.at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.len + 0.02);
    }
  } catch {
    // ohne Ton weiter
  }
}
