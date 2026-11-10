import { requireUser, unauthorized } from "@/lib/apiAuth";
import { getPrices, type ScryfallCard } from "@/lib/scryfall";
import { resolveCards, ResolveUnavailableError, type ResolveInput } from "@/lib/resolveCards";

// Ein Paket (≤ 100 Positionen) des Wunschlisten-Imports – gleiche Auflösung
// wie der Sammlungs-Import (Scryfall-ID → Set+Nummer → Name → Fuzzy).
// Wiederholen ist gefahrlos: was schon auf der Wunschliste steht, wird als
// "skipped" gemeldet statt doppelt angelegt (unique user_id+scryfall_id).
export const maxDuration = 60;

const MAX_ITEMS = 150;

type BatchItem = ResolveInput & { quantity?: number; foil?: boolean };

function imageUrl(card: ScryfallCard): string | null {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;
}

// Erwartet { items: [{ i, name, scryfallId?, set?, collectorNumber? }] }.
// Antwort: { results: [{ i, status: imported | skipped | not_found, cardName? }] }
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const items: BatchItem[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length || items.length > MAX_ITEMS) {
    return Response.json({ error: `Paket muss 1–${MAX_ITEMS} Positionen enthalten` }, { status: 400 });
  }

  let resolved: Map<number, ScryfallCard>;
  try {
    resolved = await resolveCards(items);
  } catch (err) {
    const status = err instanceof ResolveUnavailableError ? 503 : 500;
    console.error("Wunschliste-Import: Auflösung fehlgeschlagen", err);
    return Response.json({ error: err instanceof Error ? err.message : "Auflösung fehlgeschlagen" }, { status });
  }

  const ids = Array.from(new Set(Array.from(resolved.values()).map((c) => c.id)));
  const existing = new Set<string>();
  if (ids.length) {
    const { data, error } = await supabase
      .from("wishlist")
      .select("scryfall_id")
      .eq("user_id", user.id)
      .in("scryfall_id", ids);
    if (error) {
      return Response.json({ error: `Wunschliste konnte nicht gelesen werden: ${error.message}` }, { status: 500 });
    }
    for (const r of data ?? []) existing.add(r.scryfall_id);
  }

  // Neue Karten (je Scryfall-ID einmal) in einem Rutsch anlegen.
  const rows = new Map<string, Record<string, unknown>>();
  for (const card of resolved.values()) {
    if (existing.has(card.id) || rows.has(card.id)) continue;
    rows.set(card.id, {
      user_id: user.id,
      scryfall_id: card.id,
      name: card.name,
      image_url: imageUrl(card),
      price_eur: getPrices(card).eur,
    });
  }
  if (rows.size) {
    // ignoreDuplicates: ON CONFLICT DO NOTHING – braucht keine Update-Rechte
    // und macht parallele/wiederholte Pakete harmlos.
    const { error } = await supabase
      .from("wishlist")
      .upsert(Array.from(rows.values()), { onConflict: "user_id,scryfall_id", ignoreDuplicates: true });
    if (error) {
      console.error("Wunschliste-Import: Speichern fehlgeschlagen", error);
      return Response.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 });
    }
  }

  // Erste Position je neuer Karte gilt als "neu", weitere als "schon da".
  const claimed = new Set<string>();
  const results = items.map((it) => {
    const card = resolved.get(it.i);
    if (!card) return { i: it.i, status: "not_found" };
    const isNew = rows.has(card.id) && !claimed.has(card.id);
    if (isNew) claimed.add(card.id);
    return { i: it.i, status: isNew ? "imported" : "skipped", cardName: card.name };
  });

  return Response.json({ results });
}
