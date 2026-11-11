// Schneller Weg für den Scanner: direkt aus dem Browser bei Scryfall
// nachschlagen (Scryfall erlaubt das), ohne Umweg über unseren Server mit
// Login-Prüfung. Ist Set + Nummer gelesen, genügt eine Anfrage. Klappt der
// schnelle Weg nicht (verlesen, deutscher Name …), übernimmt der Server.
import type { ScanMatch } from "@/lib/scanStack";
import { nameSimilarity } from "@/lib/textSimilarity";

const API = "https://api.scryfall.com";

type Raw = {
  id: string;
  name: string;
  printed_name?: string;
  set: string;
  set_name?: string;
  collector_number: string;
  type_line?: string;
  prices?: { eur?: string | null; eur_foil?: string | null };
  image_uris?: { normal?: string };
  card_faces?: Array<{ name: string; printed_name?: string; image_uris?: { normal?: string } }>;
};

async function get(url: string): Promise<Raw | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as Raw;
      if (res.status === 404 || res.status === 400) return null;
    } catch {
      // Netzwerk: einmal wiederholen
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

function toMatch(c: Raw, exact: boolean): ScanMatch {
  return {
    id: c.id,
    name: c.name,
    imageUrl: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
    eur: c.prices?.eur ? parseFloat(c.prices.eur) : null,
    eurFoil: c.prices?.eur_foil ? parseFloat(c.prices.eur_foil) : null,
    typeLine: c.type_line,
    set: c.set,
    setName: c.set_name ?? null,
    collectorNumber: c.collector_number,
    exact,
  };
}

/**
 * Passt der gefundene Druck zu einem der gelesenen Namen? Ohne gelesenen
 * Namen gilt Set + Nummer allein. Vergleicht englischen und gedruckten
 * (z. B. deutschen) Namen, auch nur die Vorderseite.
 */
export function printMatchesRead(names: string[], printNames: Array<string | undefined | null>, min = 0.5): boolean {
  const usable = names.filter((n) => n.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 3);
  if (!usable.length) return true;
  const targets = printNames.flatMap((p) => (p ? [p, p.split(" // ")[0]] : []));
  return usable.some((n) => targets.some((t) => nameSimilarity(n, t) >= min));
}

/** Genauer Druck über Set + Nummer (englischer Druck wegen der Preise). */
export async function directPrint(set: string, number: string, lang: string | null, names: string[]): Promise<ScanMatch | null> {
  const base = `${API}/cards/${encodeURIComponent(set.toLowerCase())}/${encodeURIComponent(number)}`;
  // Sprachkürzel der Karte → Scryfall (Chinesisch hat eigene Kürzel)
  const LANG: Record<string, string> = { ZH: "zhs", CS: "zhs", CT: "zht" };
  const foreign = lang && lang !== "EN" ? LANG[lang] ?? lang.toLowerCase() : null;
  // Fremdsprachige Karte: gedruckten Namen gleichzeitig holen, um ihn mit
  // dem gelesenen (z. B. deutschen) Namen zu vergleichen.
  const [en, local] = await Promise.all([get(base), foreign ? get(`${base}/${foreign}`) : Promise.resolve(null)]);
  if (!en) return null;
  const printed = [en.name, local?.printed_name, ...(local?.card_faces?.map((f) => f.printed_name) ?? [])];
  return printMatchesRead(names, printed) ? toMatch(en, true) : null;
}

/** Karte über den (englischen) Namen, unscharf – Druck noch unbekannt. */
export async function directByName(name: string): Promise<ScanMatch | null> {
  const c = await get(`${API}/cards/named?fuzzy=${encodeURIComponent(name)}`);
  return c ? toMatch(c, false) : null;
}
