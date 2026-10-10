import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardByName, getPrices, sleep, type ScryfallCard } from "@/lib/scryfall";
import { resolveVariants } from "@/lib/ocr";

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
  const { user } = await requireUser();
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;
  const name = params.get("name")?.trim() ?? "";
  const set = (params.get("set") ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const number = (params.get("number") ?? "").replace(/[^0-9a-z]/gi, "");
  if (!name && !(set && number)) return NextResponse.json({ error: "Kein Name angegeben" }, { status: 400 });

  // 1) Druck über Set + Nummer.
  const byNumber = set && number ? await getJson<ScryfallCard & { set_name?: string }>(`${SCRYFALL}/cards/${set}/${number}`) : null;

  // 2) Karte über den Namen (unscharf, mit gekürzten Varianten).
  let byName: ScryfallCard | null = null;
  if (name) {
    for (const variant of resolveVariants(name)) {
      const r = await fetchCardByName(variant).catch(() => null);
      if (r?.card) {
        byName = r.card;
        break;
      }
      await sleep(100);
    }
  }

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
  let suggestions: string[] = [];
  if (name) {
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
