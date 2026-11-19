// Wenig Licht erkennen (rein, getestet). Dunkle Kamerabilder sind verrauscht –
// die Texterkennung liest dann eher Unsinn, der zufällig einem Kartennamen
// ähnelt. Bei wenig Licht wird darum strenger angenommen: Der Name muss in
// zwei Bildern hintereinander gleich gelesen werden.

/** mittlere Helligkeit im Hilfsrahmen, unter der es als "wenig Licht" gilt */
export const DIM_LEVEL = 62;
/** so lange darf die zweite Lesung auf sich warten lassen */
export const CONFIRM_MS = 4000;

export function mean(g: Float32Array): number {
  let s = 0;
  for (let i = 0; i < g.length; i++) s += g[i];
  return g.length ? s / g.length : 0;
}

export type Pending = { name: string; at: number } | null;

/**
 * Bei wenig Licht: Name erst annehmen, wenn er zum zweiten Mal (kurz
 * hintereinander) gelesen wurde. Liefert, ob jetzt angenommen werden darf,
 * und den neuen Wartezustand.
 */
export function confirmDim(pending: Pending, name: string, now: number, dim: boolean): { accept: boolean; pending: Pending } {
  if (!dim) return { accept: true, pending: null };
  if (pending && pending.name === name && now - pending.at <= CONFIRM_MS) return { accept: true, pending: null };
  return { accept: false, pending: { name, at: now } };
}
