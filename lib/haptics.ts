// Vibration als Rückmeldung (z. B. Karte gescannt, Trade gesendet).
// - Android/Chrome: navigator.vibrate mit Muster je Art
// - iPhone: Safari kennt navigator.vibrate nicht. Ab iOS 17.4 gibt das
//   Umschalten eines Schalters (<input type="checkbox" switch>) einen
//   leichten haptischen Tick – den lösen wir über ein unsichtbares Element
//   aus (mehrere Ticks für Erfolg/Fehler). Auf älteren iPhones passiert nichts.
// Abschaltbar in den Einstellungen (Mein Konto → Mitteilungen & Feedback).
import { fxEnabled } from "@/lib/fxSettings";

export type HapticKind = "tap" | "success" | "warning" | "error";

/** Vibrationsmuster (Android) und Anzahl Ticks (iPhone) je Art (rein). */
export function hapticPattern(kind: HapticKind): { vibrate: number[]; ticks: number } {
  switch (kind) {
    case "tap":
      return { vibrate: [15], ticks: 1 };
    case "success":
      return { vibrate: [30, 60, 45], ticks: 2 };
    case "warning":
      return { vibrate: [60, 80, 60], ticks: 2 };
    case "error":
      return { vibrate: [80, 60, 80, 60, 80], ticks: 3 };
  }
}

let switchLabel: HTMLLabelElement | null = null;

function iosTick() {
  if (typeof document === "undefined") return;
  if (!switchLabel) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    switchLabel = label;
  }
  switchLabel.click();
}

function vibrate(pattern: number[], ticks: number) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
      return;
    }
    iosTick();
    for (let i = 1; i < ticks; i++) setTimeout(iosTick, i * 110);
  } catch {
    // ohne Vibration weiter
  }
}

/** Rückmeldung einer Art (tap, success, warning, error). */
export function haptic(kind: HapticKind = "tap") {
  if (!fxEnabled("haptics")) return;
  const p = hapticPattern(kind);
  vibrate(p.vibrate, p.ticks);
}

/** Einzelner Stoß fester Länge (Scanner). */
export function buzz(ms = 40) {
  if (!fxEnabled("haptics")) return;
  vibrate([ms], 1);
}
