import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardByName, fetchCollectionWithRetry, sleep, type ScryfallCard } from "@/lib/scryfall";
import { ndjsonStream, writeImport, type ResolvedEntry } from "@/lib/importCards";

export const maxDuration = 300;

const CHUNK = 75;
// Namen, die der Sammelabruf nicht exakt findet, werden einzeln "fuzzy"
// gesucht (Tippfehler, Groß-/Kleinschreibung). Begrenzt, damit eine Liste
// voller Unsinn nicht minutenlang einzeln abgefragt wird.
const MAX_FUZZY = 60;

// Erwartet { entries: [{ name, quantity, foil? }] }.
// Antwort ist NDJSON: "progress"-Events, am Ende genau ein "result" oder "error".
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = await request.json().catch(() => ({}));
  const entries: Array<{ name: string; quantity?: number; foil?: boolean }> = body.entries ?? [];
  const allowDuplicates: boolean = body.allowDuplicates ?? false;

  if (!entries.length) {
    return Response.json({ error: "Keine Karten übergeben" }, { status: 400 });
  }

  return ndjsonStream(async (send) => {
    const uniqueNames = Array.from(new Set(entries.map((e) => e.name.trim()).filter(Boolean)));
    const total = uniqueNames.length;
    send({ type: "progress", phase: "resolve", done: 0, total });

    // Stufe 1: Sammelabruf per exaktem Namen (75 je Request statt 1).
    const byName = new Map<string, ScryfallCard>();
    for (let i = 0; i < uniqueNames.length; i += CHUNK) {
      const chunk = uniqueNames.slice(i, i + CHUNK);
      const cards = await fetchCollectionWithRetry(chunk.map((name) => ({ name })));
      for (const card of cards ?? []) {
        byName.set(card.name.toLowerCase(), card);
        // Doppelseitige Karten: Liste enthält oft nur die Vorderseite.
        const front = card.name.split(" // ")[0];
        if (front !== card.name) byName.set(front.toLowerCase(), card);
      }
      send({ type: "progress", phase: "resolve", done: Math.min(i + CHUNK, total), total });
      if (i + CHUNK < uniqueNames.length) await sleep(120);
    }

    // Stufe 2: Rest einzeln per Fuzzy-Suche.
    const missing = uniqueNames.filter((n) => !byName.has(n.toLowerCase()));
    for (const name of missing.slice(0, MAX_FUZZY)) {
      const r = await fetchCardByName(name).catch(() => null);
      if (r?.card) byName.set(name.toLowerCase(), r.card);
      await sleep(100);
    }

    const resolved: ResolvedEntry[] = [];
    const notFound: string[] = [];
    for (const entry of entries) {
      const name = entry.name.trim();
      if (!name) continue;
      const card = byName.get(name.toLowerCase());
      if (!card) {
        if (!notFound.includes(name)) notFound.push(name);
        continue;
      }
      resolved.push({ card, quantity: Math.max(1, entry.quantity ?? 1), foil: entry.foil ?? false });
    }

    const result = await writeImport(supabase, user.id, resolved, allowDuplicates, (done, total) =>
      send({ type: "progress", phase: "save", done, total })
    );
    return { ...result, notFound };
  });
}
