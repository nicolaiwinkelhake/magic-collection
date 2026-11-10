// Kartenrahmen für eine Vollbild-Kamera (object-fit: cover), rein/getestet.
// Das Video wird beschnitten; der Rahmen muss im SICHTBAREN Teil liegen.
// Liefert ihn einmal relativ zum Videobild (für die Texterkennung) und
// einmal relativ zum Bildschirm-Element (für die Anzeige).

export type Rect = { x: number; y: number; w: number; h: number }; // relativ 0–1

export const CARD_RATIO = 63 / 88; // Breite / Höhe einer Magic-Karte

export function coverGuide(
  videoW: number,
  videoH: number,
  elW: number,
  elH: number,
  opts: { maxHeight?: number; maxWidth?: number; centerY?: number } = {},
): { video: Rect; screen: Rect } {
  const { maxHeight = 0.62, maxWidth = 0.8, centerY = 0.42 } = opts;
  const scale = Math.max(elW / videoW, elH / videoH);
  // sichtbarer Ausschnitt in Videopixeln
  const visW = elW / scale;
  const visH = elH / scale;
  const visX = (videoW - visW) / 2;
  const visY = (videoH - visH) / 2;

  let h = visH * maxHeight;
  let w = h * CARD_RATIO;
  if (w > visW * maxWidth) {
    w = visW * maxWidth;
    h = w / CARD_RATIO;
  }
  const cx = visX + visW / 2;
  const cy = visY + visH * centerY;
  const x = cx - w / 2;
  const y = Math.max(visY, cy - h / 2);

  return {
    video: { x: x / videoW, y: y / videoH, w: w / videoW, h: h / videoH },
    screen: { x: (x - visX) / visW, y: (y - visY) / visH, w: w / visW, h: h / visH },
  };
}
