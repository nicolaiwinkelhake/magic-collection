import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCollectionWithRetry, sleep, type ScryfallCard } from "@/lib/scryfall";
import { ndjsonStream, writeImport, type ResolvedEntry } from "@/lib/importCards";

const CHUNK = 75;

// Grosse Sammlungen (1000+ Zeilen) brauchen mit Scryfall-Batches + DB-Writes
// mehr Zeit als die frueheren 120s.
export const maxDuration = 300;

type ImportEntry = {
  scryfallId: string;
  name: string;
  quantity: number;
  foil: boolean;
  set?: string;
  collectorNumber?: string;
};

// Importiert Karten anhand von Scryfall-IDs (aus Moxfield-/ManaBox-CSV).
// Erwartet { entries: [{ scryfallId, name, quantity, foil, set?, collectorNumber? }] }.
// Auflösung in drei Stufen: Scryfall-ID -> Set+Sammlernummer -> Name.
// Antwort ist NDJSON: "progress"-Events, am Ende genau ein "result" oder "error".
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const entries: ImportEntry[] = (body.entries ?? [])
    .filter((e: ImportEntry) => e.scryfallId?.trim())
    .map((e: ImportEntry) => ({ ...e, scryfallId: e.scryfallId.trim(), quantity: Math.max(1, e.quantity ?? 1) }));
  const allowDuplicates: boolean = body.allowDuplicates ?? false;
  if (!entries.length) {
    return Response.json({ error: "Keine Einträge" }, { status: 400 });
  }

  return ndjsonStream(async (send) => {
    // Gleiche IDs nur einmal bei Scryfall abfragen.
    const uniqueIds = Array.from(new Set(entries.map((e) => e.scryfallId)));
    const total = uniqueIds.length;
    send({ type: "progress", phase: "resolve", done: 0, total });

    // Stufe 1: Auflösung per Scryfall-ID (exakt).
    const byId = new Map<string, ScryfallCard>();
    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const cards = await fetchCollectionWithRetry(uniqueIds.slice(i, i + CHUNK).map((id) => ({ id })));
      for (const card of cards ?? []) byId.set(card.id, card);
      send({ type: "progress", phase: "resolve", done: Math.min(i + CHUNK, total), total });
      if (i + CHUNK < uniqueIds.length) await sleep(120);
    }

    // Stufe 2: Übrige per Set-Code + Sammlernummer (fängt veraltete IDs ab).
    const setCnKey = (set: string, cn: string) => `${set.toLowerCase()}|${cn}`;
    const pending = entries.filter((e) => !byId.has(e.scryfallId));
    const setCnPending = Array.from(
      new Map(
        pending.filter((e) => e.set && e.collectorNumber).map((e) => [setCnKey(e.set!, e.collectorNumber!), e])
      ).values()
    );
    const bySetCn = new Map<string, ScryfallCard>();
    for (let i = 0; i < setCnPending.length; i += CHUNK) {
      const chunk = setCnPending.slice(i, i + CHUNK);
      const cards = await fetchCollectionWithRetry(
        chunk.map((e) => ({ set: e.set!.toLowerCase(), collector_number: e.collectorNumber! }))
      );
      for (const card of cards ?? []) bySetCn.set(setCnKey(card.set, card.collector_number), card);
      if (i + CHUNK < setCnPending.length) await sleep(120);
    }

    const resolveEntry = (e: ImportEntry): ScryfallCard | undefined =>
      byId.get(e.scryfallId) ??
      (e.set && e.collectorNumber ? bySetCn.get(setCnKey(e.set, e.collectorNumber)) : undefined);

    // Stufe 3: Rest per Kartenname (irgendein Druck ist besser als keiner).
    const namePending = Array.from(
      new Set(pending.filter((e) => !resolveEntry(e) && e.name).map((e) => e.name))
    );
    const byName = new Map<string, ScryfallCard>();
    for (let i = 0; i < namePending.length; i += CHUNK) {
      const cards = await fetchCollectionWithRetry(namePending.slice(i, i + CHUNK).map((name) => ({ name })));
      for (const card of cards ?? []) {
        byName.set(card.name.toLowerCase(), card);
        // Doppelseitige Karten: CSV enthält oft nur die Vorderseite.
        const front = card.name.split(" // ")[0];
        if (front !== card.name) byName.set(front.toLowerCase(), card);
      }
      if (i + CHUNK < namePending.length) await sleep(120);
    }

    const resolved: ResolvedEntry[] = [];
    const notFound: string[] = [];
    for (const entry of entries) {
      const card = resolveEntry(entry) ?? byName.get(entry.name.toLowerCase());
      if (!card) {
        if (!notFound.includes(entry.name)) notFound.push(entry.name);
        continue;
      }
      resolved.push({ card, quantity: entry.quantity, foil: entry.foil });
    }

    const result = await writeImport(supabase, user.id, resolved, allowDuplicates, (done, total) =>
      send({ type: "progress", phase: "save", done, total })
    );
    return { ...result, notFound };
  });
}
