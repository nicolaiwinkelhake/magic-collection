// Kurzes Vibrieren als Rückmeldung (z. B. Karte gescannt).
// - Android/Chrome: navigator.vibrate
// - iPhone: Safari kennt navigator.vibrate nicht. Ab iOS 17.4 gibt das
//   Umschalten eines Schalters (<input type="checkbox" switch>) einen
//   leichten haptischen Tick – den lösen wir über ein unsichtbares Element
//   aus. Auf älteren iPhones passiert nichts.
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

export function buzz(ms = 40) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
      return;
    }
    iosTick();
  } catch {
    // ohne Vibration weiter
  }
}
