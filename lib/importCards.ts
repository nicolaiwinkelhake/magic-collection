import type { SupabaseClient } from "@supabase/supabase-js";

// Gemeinsame Schreiblogik für /api/import und /api/import-csv.
//
// Früher lief pro Karte select → insert/update → rpc nacheinander (3 Round-
// Trips je Karte). Bei großen Sammlungen lief das in das Vercel-Zeitlimit,
// der Stream brach ab und der Client blieb bei "Importiere..." hängen.
// Fehler beim Insert wurden zudem ignoriert und die Karte trotzdem gezählt.
// Jetzt: vorhandene Karten in Blöcken lesen, neue Karten gesammelt einfügen,
// Fehler pro Block erfassen und melden.

export type ScryfallCardData = Record<string, unknown>;

export type ResolvedEntry = {
  card: ScryfallCardData;
  quantity: number;
  foil: boolean;
};

export type ExistingRow = { id: string; scryfall_id: string; foil: boolean; quantity: number };

export type ImportPlan = {
  inserts: ResolvedEntry[];
  updates: Array<{ id: string; newQuantity: number; entry: ResolvedEntry }>;
  skipped: string[];
};

const keyOf = (scryfallId: string, foil: boolean) => `${scryfallId}|${foil ? 1 : 0}`;

// Gleiche Karte (ID + Foil) zusammenfassen, z. B. mehrere CSV-Zeilen je
// Zustand/Sprache oder "Bolt" und "Lightning Bolt" in einer Textliste.
export function aggregateEntries(entries: ResolvedEntry[]): ResolvedEntry[] {
  const byKey = new Map<string, ResolvedEntry>();
  for (const e of entries) {
    const key = keyOf(e.card.id as string, e.foil);
    const existing = byKey.get(key);
    if (existing) existing.quantity += e.quantity;
    else byKey.set(key, { ...e });
  }
  return Array.from(byKey.values());
}

// Reine Entscheidung, was eingefügt, erhöht oder übersprungen wird.
export function planImport(
  entries: ResolvedEntry[],
  existing: ExistingRow[],
  allowDuplicates: boolean
): ImportPlan {
  const existingByKey = new Map(existing.map((r) => [keyOf(r.scryfall_id, r.foil), r]));
  const plan: ImportPlan = { inserts: [], updates: [], skipped: [] };
  for (const entry of aggregateEntries(entries)) {
    const row = existingByKey.get(keyOf(entry.card.id as string, entry.foil));
    if (!row) {
      plan.inserts.push(entry);
    } else if (allowDuplicates) {
      plan.updates.push({ id: row.id, newQuantity: row.quantity + entry.quantity, entry });
    } else {
      const name = entry.card.name as string;
      if (!plan.skipped.includes(name)) plan.skipped.push(name);
    }
  }
  return plan;
}

export function cardPrices(card: ScryfallCardData): { eur: number | null; eurFoil: number | null } {
  const raw = card.prices as Record<string, string | null> | undefined;
  return {
    eur: raw?.eur ? parseFloat(raw.eur) : null,
    eurFoil: raw?.eur_foil ? parseFloat(raw.eur_foil) : null,
  };
}

export function cardImageUrl(card: ScryfallCardData): string | null {
  const imageUris = card.image_uris as Record<string, string> | undefined;
  const faces = card.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
  return imageUris?.normal ?? faces?.[0]?.image_uris?.normal ?? null;
}

function toRow(userId: string, e: ResolvedEntry, now: string) {
  const { eur, eurFoil } = cardPrices(e.card);
  return {
    user_id: userId,
    scryfall_id: e.card.id as string,
    name: e.card.name as string,
    set_code: e.card.set as string,
    collector_number: e.card.collector_number as string,
    image_url: cardImageUrl(e.card),
    mana_cost: (e.card.mana_cost as string | null) ?? null,
    cmc: (e.card.cmc as number) ?? 0,
    type_line: e.card.type_line as string,
    colors: (e.card.colors as string[]) ?? [],
    rarity: e.card.rarity as string,
    oracle_text: (e.card.oracle_text as string | null) ?? null,
    quantity: e.quantity,
    foil: e.foil,
    price_eur: eur,
    price_eur_foil: eurFoil,
    price_updated_at: now,
  };
}

// Führt Aufgaben mit begrenzter Parallelität aus (schont Supabase, ist aber
// deutlich schneller als strikt sequenziell).
async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

const READ_CHUNK = 150;
const WRITE_CHUNK = 250;

export type WriteResult = { imported: number; skipped: string[]; failed: string[] };

export async function writeImport(
  supabase: SupabaseClient,
  userId: string,
  resolved: ResolvedEntry[],
  allowDuplicates: boolean,
  onProgress: (done: number, total: number) => void
): Promise<WriteResult> {
  const entries = aggregateEntries(resolved);
  const ids = Array.from(new Set(entries.map((e) => e.card.id as string)));

  // 1) Vorhandene Karten blockweise laden.
  const existing: ExistingRow[] = [];
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, scryfall_id, foil, quantity")
      .eq("user_id", userId)
      .in("scryfall_id", ids.slice(i, i + READ_CHUNK));
    if (error) throw new Error(`Sammlung konnte nicht gelesen werden: ${error.message}`);
    existing.push(...((data ?? []) as ExistingRow[]));
  }

  const plan = planImport(entries, existing, allowDuplicates);
  const total = plan.inserts.length + plan.updates.length;
  let done = 0;
  let imported = 0;
  const failed: string[] = [];
  const succeeded: ResolvedEntry[] = [];
  const now = new Date().toISOString();
  onProgress(done, total);

  // 2) Neue Karten gesammelt einfügen. Schlägt ein Block fehl, einzeln
  //    nachversuchen, damit eine kaputte Karte nicht 249 andere mitreißt.
  for (let i = 0; i < plan.inserts.length; i += WRITE_CHUNK) {
    const chunk = plan.inserts.slice(i, i + WRITE_CHUNK);
    const { error } = await supabase.from("cards").insert(chunk.map((e) => toRow(userId, e, now)));
    if (!error) {
      succeeded.push(...chunk);
    } else {
      await runLimited(chunk, 5, async (e) => {
        const { error: rowError } = await supabase.from("cards").insert(toRow(userId, e, now));
        if (rowError) failed.push(e.card.name as string);
        else succeeded.push(e);
      });
    }
    done += chunk.length;
    onProgress(done, total);
  }

  // 3) Mengen vorhandener Karten erhöhen (nur bei "Duplikate zulassen").
  await runLimited(plan.updates, 8, async (u) => {
    const { eur, eurFoil } = cardPrices(u.entry.card);
    const { error } = await supabase
      .from("cards")
      .update({ quantity: u.newQuantity, price_eur: eur, price_eur_foil: eurFoil, price_updated_at: now })
      .eq("id", u.id);
    if (error) failed.push(u.entry.card.name as string);
    else succeeded.push(u.entry);
    done += 1;
    if (done % 20 === 0 || done === total) onProgress(done, total);
  });

  for (const e of succeeded) imported += e.quantity;

  // 4) Preisverlauf: nicht kritisch, Fehler brechen den Import nicht ab.
  const priceIds = new Map<string, ScryfallCardData>();
  for (const e of succeeded) priceIds.set(e.card.id as string, e.card);
  await runLimited(Array.from(priceIds.values()), 8, async (card) => {
    const { eur, eurFoil } = cardPrices(card);
    await supabase.rpc("record_card_price", { p_scryfall_id: card.id, p_eur: eur, p_eur_foil: eurFoil });
  });
  if (succeeded.length) await supabase.rpc("snapshot_collection_value");

  return { imported, skipped: plan.skipped, failed };
}

// NDJSON-Stream, der garantiert mit einem "result"- oder "error"-Event endet
// und immer geschlossen wird – auch wenn unterwegs etwas wirft.
export function ndjsonStream(
  run: (send: (obj: unknown) => void) => Promise<unknown>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        send({ type: "result", ...((await run(send)) as object) });
      } catch (err) {
        console.error("Import fehlgeschlagen:", err);
        send({ type: "error", error: err instanceof Error ? err.message : "Unbekannter Fehler" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
