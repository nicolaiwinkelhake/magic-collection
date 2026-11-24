// Geräte-Einstellungen für Vibration und Töne in der App (je Gerät im
// Browser gespeichert, Standard: an).

export type FxKey = "haptics" | "sounds";

const KEY: Record<FxKey, string> = { haptics: "fx-haptics", sounds: "fx-sounds" };

export function fxEnabled(key: FxKey): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(KEY[key]) !== "0";
  } catch {
    return true;
  }
}

export function setFx(key: FxKey, on: boolean) {
  try {
    window.localStorage.setItem(KEY[key], on ? "1" : "0");
  } catch {
    // Speicher gesperrt: bleibt beim Standard
  }
}
