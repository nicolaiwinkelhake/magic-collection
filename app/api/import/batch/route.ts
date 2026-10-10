import { requireUser, unauthorized } from "@/lib/apiAuth";
import { getPrices, type ScryfallCard } from "@/lib/scryfall";
import { resolveCards, ResolveUnavailableError, type ResolveInput } from "@/lib/resolveCards";

// Ein Paket (≤ 100 Positionen) ist schnell erledigt; großzügiger Puffer für
// Scryfall-Retries und Fuzzy-Suche.
export const maxDuration = 60;

const MAX_ITEMS = 150;

type BatchItem = ResolveInput & { quantity: number; foil: boolean };

function imageUrl(card: ScryfallCard): string | null {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;
}

// Erwartet { batchKey, allowDuplicates, items: [{ i, name, quantity, foil, scryfallId?, set?, collectorNumber? }] }.
// Antwort: { results: [{ i, status, cardName? }], replayed }
//   status: imported | updated | skipped | not_found
// Schreiben erfolgt atomar + idempotent über import_cards_batch (Migration 005):
// derselbe batchKey wird nie doppelt gebucht.
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const batchKey: string = body?.batchKey ?? "";
  const allowDuplicates = Boolean(body?.allowDuplicates);
  const items: BatchItem[] = Array.isArray(body?.items) ? body.items : [];

  if (!/^[a-f0-9-]{16,128}$/i.test(batchKey)) {
    return Response.json({ error: "Ungültiger Paket-Schlüssel" }, { status: 400 });
  }
  if (!items.length || items.length > MAX_ITEMS) {
    return Response.json({ error: `Paket muss 1–${MAX_ITEMS} Positionen enthalten` }, { status: 400 });
  }

  let resolved: Map<number, ScryfallCard>;
  try {
    resolved = await resolveCards(items);
  } catch (err) {
    const status = err instanceof ResolveUnavailableError ? 503 : 500;
    console.error("Import: Auflösung fehlgeschlagen", err);
    return Response.json({ error: err instanceof Error ? err.message : "Auflösung fehlgeschlagen" }, { status });
  }

  // Positionen, die auf dieselbe Karte (+ Foil) zeigen, zu einer Zeile
  // zusammenfassen – sonst würde die zweite als "schon vorhanden" gelten.
  const rows = new Map<string, { row: Record<string, unknown>; members: number[] }>();
  for (const it of items) {
    const card = resolved.get(it.i);
    if (!card) continue;
    const key = `${card.id}|${it.foil ? 1 : 0}`;
    const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
    const existing = rows.get(key);
    if (existing) {
      (existing.row.quantity as number) += qty;
      existing.members.push(it.i);
      continue;
    }
    const { eur, eurFoil } = getPrices(card);
    rows.set(key, {
      members: [it.i],
      row: {
        i: rows.size,
        scryfall_id: card.id,
        name: card.name,
        set_code: card.set,
        collector_number: card.collector_number,
        image_url: imageUrl(card),
        mana_cost: card.mana_cost ?? null,
        cmc: card.cmc ?? 0,
        type_line: card.type_line,
        colors: card.colors ?? [],
        rarity: card.rarity,
        oracle_text: card.oracle_text ?? null,
        quantity: qty,
        foil: Boolean(it.foil),
        price_eur: eur,
        price_eur_foil: eurFoil,
      },
    });
  }

  const groups = Array.from(rows.values());
  const statusByItem = new Map<number, string>();
  let replayed = false;

  if (groups.length) {
    const { data, error } = await supabase.rpc("import_cards_batch", {
      p_batch_key: batchKey,
      p_rows: groups.map((g) => g.row),
      p_allow_duplicates: allowDuplicates,
    });
    if (error) {
      console.error("Import: Speichern fehlgeschlagen", error);
      return Response.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 });
    }
    replayed = Boolean(data?.replayed);
    for (const r of (data?.rows ?? []) as Array<{ i: number; status: string }>) {
      for (const member of groups[r.i]?.members ?? []) statusByItem.set(member, r.status);
    }
  }

  const results = items.map((it) => {
    const card = resolved.get(it.i);
    return {
      i: it.i,
      status: card ? statusByItem.get(it.i) ?? "error" : "not_found",
      cardName: card?.name,
    };
  });

  return Response.json({ results, replayed });
}
