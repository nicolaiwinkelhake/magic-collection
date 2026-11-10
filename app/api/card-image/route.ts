// Kartenbild von Scryfall durchreichen (gleiche Herkunft → im Browser per
// Canvas auslesbar, z. B. für den Bildvergleich im Scanner). Nur Bilder von
// cards.scryfall.io, kleine Variante, lange cachebar (Scryfall-Bild-URLs
// enthalten einen Zeitstempel und ändern sich bei neuen Bildern).
export const runtime = "edge";

const ALLOWED_HOST = "cards.scryfall.io";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Ungültige URL", { status: 400 });
  }
  if (target.protocol !== "https:" || target.hostname !== ALLOWED_HOST) {
    return new Response("Nicht erlaubt", { status: 400 });
  }
  // kleine Variante genügt (146×204) und spart Bandbreite
  target.pathname = target.pathname.replace(/^\/(normal|large|png|border_crop)\//, "/small/");

  const res = await fetch(target.toString(), { headers: { "User-Agent": "MagicCollectionApp/1.0" } });
  if (!res.ok || !res.body) return new Response("Bild nicht verfügbar", { status: 502 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable",
    },
  });
}
