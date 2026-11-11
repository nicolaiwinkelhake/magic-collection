import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardByName, getPrices, sleep, type ScryfallCard } from "@/lib/scryfall";
import { resolveVariants } from "@/lib/ocr";
import { bestNameMatch } from "@/lib/textSimilarity";
import { germanNameFromCard } from "@/lib/germanNames";

const SCRYFALL = "https://api.scryfall.com";
const HEADERS = { "User-Agent": "MagicCollectionApp/1.0" };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const sameCard = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase() || a.split(" // ")[0].toLowerCase() === b.split(" // ")[0].toLowerCase();

// GET /api/scryfall/resolve?name=...&set=mkm&number=1
// Bester Scryfall-Treffer für einen (per OCR erkannten) Namen – zur
// Bestätigung, bevor importiert wird. Sind Set-Kürzel und Sammlernummer
// (Infozeile unten links) bekannt, wird der genaue Druck bestimmt.
// Robust gegen Lesefehler: unscharfe Suche, gekürzte Varianten, Vorschläge.
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;
  const name = params.get("name")?.trim() ?? "";
  const set = (params.get("set") ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const number = (params.get("number") ?? "").replace(/[^0-9a-z]/gi, "");
  // Sprache aus der Infozeile (z. B. "DE") – deutsche Karten zuerst über den deutschen Namen
  const lang = (params.get("lang") ?? "").toUpperCase();
  if (!name && !(set && number)) return NextResponse.json({ error: "Kein Name angegeben" }, { status: 400 });

  // 1) Druck über Set + Nummer – gleichzeitig mit der Namenssuche (spart Zeit).
  const byNumberP = set && number ? getJson<ScryfallCard & { set_name?: string }>(`${SCRYFALL}/cards/${set}/${number}`) : Promise.resolve(null);
  const firstByNameP = name && lang !== "DE" ? fetchCardByName(name).catch(() => null) : Promise.resolve(null);
  const [byNumber, firstByName] = await Promise.all([byNumberP, firstByNameP]);

  // 2) Karte über den Namen (unscharf, mit gekürzten Varianten). Ist die
  //    Karte laut Infozeile deutsch, zuerst den deutschen Namen versuchen.
  let byName: ScryfallCard | null = firstByName?.card ?? null;
  if (name && !byName && lang === "DE") byName = await findByGermanName(name, supabase);
  if (name && !byName) {
    // Den vollen Namen hat die parallele Abfrage oben schon probiert
    for (const variant of resolveVariants(name).slice(lang !== "DE" ? 1 : 0)) {
      const r = await fetchCardByName(variant).catch(() => null);
      if (r?.card) {
        byName = r.card;
        break;
      }
      await sleep(100);
    }
  }
  // Englisch nichts gefunden → deutschen Namen versuchen (Sprache unbekannt).
  if (name && !byName && lang !== "DE") byName = await findByGermanName(name, supabase);

  // 3) Entscheiden: Set/Nummer gilt, wenn der Name passt (oder keiner gelesen
  //    wurde). Passt er nicht (Nummer verlesen), denselben Namen im Set suchen.
  let card: (ScryfallCard & { set_name?: string }) | null = null;
  let exact = false;
  if (byNumber && (!byName || sameCard(byNumber.name, byName.name))) {
    card = byNumber;
    exact = true;
  } else if (byName && set) {
    const q = new URLSearchParams({ q: `!"${byName.name.replace(/"/g, "")}" e:${set}`, unique: "prints" });
    const found = await getJson<{ data?: Array<ScryfallCard & { set_name?: string }> }>(`${SCRYFALL}/cards/search?${q}`);
    card = found?.data?.[0] ?? byName;
    exact = Boolean(found?.data?.length);
  } else {
    card = byName;
  }

  // Vorschläge: Autovervollständigung auf die ersten Wörter (englische Namen).
  // Im automatischen Scan ohne Vorschläge (spart eine Anfrage je Karte).
  let suggestions: string[] = [];
  if (name && params.get("suggest") !== "0") {
    const data = await getJson<{ data?: string[] }>(
      `${SCRYFALL}/cards/autocomplete?${new URLSearchParams({ q: name.split(" ").slice(0, 2).join(" ") })}`
    );
    suggestions = (data?.data ?? []).slice(0, 6);
  }

  if (!card) {
    return NextResponse.json({ error: `Keine Karte für „${name || `${set} ${number}`}“ gefunden.`, suggestions }, { status: 404 });
  }

  const { eur, eurFoil } = getPrices(card);
  return NextResponse.json({
    id: card.id,
    name: card.name,
    imageUrl: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null,
    eur,
    eurFoil,
    typeLine: card.type_line,
    set: card.set,
    setName: card.set_name ?? null,
    collectorNumber: card.collector_number,
    exact,
    suggestions: suggestions.filter((s) => s !== card!.name),
  });
}

type GermanHit = ScryfallCard & { printed_name?: string; card_faces?: Array<{ name: string; printed_name?: string }> };

// Deutschen Kartennamen auflösen. Zwei Quellen, jeder Treffer wird gegen den
// gelesenen Namen geprüft (toleriert Lesefehler):
// 1) eigene Sammlung (dort sind deutsche Namen gespeichert) → englischer Name
// 2) Scryfall-Suche in deutschen Drucken
async function findByGermanName(
  read: string,
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
): Promise<ScryfallCard | null> {
  const words = read.split(" ").filter((w) => w.replace(/[^a-zA-ZÀ-ÿ]/g, "").length >= 3);
  if (!words.length) return null;

  // 1) Eigene Sammlung: Kandidaten über das längste Wort vorfiltern
  const longest = [...words].sort((a, b) => b.length - a.length)[0].replace(/[%_,]/g, "");
  const { data: own } = await supabase
    .from("cards")
    .select("name, name_de")
    .ilike("name_de", `%${longest}%`)
    .limit(50);
  const ownHit = bestNameMatch(read, own ?? [], (r) => r.name_de as string);
  if (ownHit) {
    const r = await fetchCardByName(ownHit.item.name as string).catch(() => null);
    if (r?.card) return r.card;
  }

  // 2) Scryfall: deutsche Drucke, deren Name die gelesenen Wörter enthält
  for (const query of [words.join(" "), longest]) {
    const q = new URLSearchParams({ q: `lang:de ${query}`, unique: "prints" });
    const found = await getJson<{ data?: GermanHit[] }>(`${SCRYFALL}/cards/search?${q}`);
    const hit = bestNameMatch(read, found?.data ?? [], (c) => germanNameFromCard(c) ?? c.printed_name);
    if (hit) {
      // Englischen Standarddruck holen (Preise gibt es vor allem dort)
      const r = await fetchCardByName(hit.item.name).catch(() => null);
      return r?.card ?? hit.item;
    }
    await sleep(100);
  }
  return null;
}
