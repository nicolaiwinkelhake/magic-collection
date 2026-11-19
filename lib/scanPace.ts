// Takt der Scan-Automatik (rein, getestet): nur so oft ins Kamerabild
// schauen wie nötig – spart Akku und hält das Handy kühler.
// - Karte liegt da und wurde noch nicht gelesen → schnell (sofort reagieren)
// - keine Karte im Bild → gemächlich nachsehen, ob eine kommt
// - Karte schon gelesen, warten auf Kartenwechsel → gemächlich
// - App im Hintergrund / Bildschirm aus → praktisch Pause
import type { Rect } from "@/lib/scanGeometry";

export const PACE = { fast: 40, idle: 120, waiting: 160, hidden: 600 } as const;

export function nextTickMs(s: { hidden: boolean; present: boolean; armed: boolean }): number {
  if (s.hidden) return PACE.hidden;
  if (!s.present) return PACE.idle;
  return s.armed ? PACE.fast : PACE.waiting;
}

/** Erkannter Kartenrahmen praktisch unverändert? (dann nicht neu zeichnen) */
export function sameRect(a: Rect | null, b: Rect | null, tol = 0.004): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.w - b.w) < tol && Math.abs(a.h - b.h) < tol;
}
