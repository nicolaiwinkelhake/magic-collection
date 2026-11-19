import { fetchCardByName, fetchCollectionWithRetry, sleep, type ScryfallCard } from "@/lib/scryfall";
import { catalogByIds, catalogByNames, catalogBySetNumber } from "@/lib/catalogLookup";

const CHUNK = 75;
const MAX_FUZZY = 25;

export type ResolveInput = {
  i: number;
  name: string;
  scryfallId?: string;
  set?: string;
  collectorNumber?: string;
};

// Scryfall war (auch nach Retries) nicht erreichbar. Das Paket darf dann
// NICHT als erledigt gelten, sonst würden Karten fälschlich als "nicht
// gefunden" markiert – der Client versucht es später erneut.
export class ResolveUnavailableError extends Error {}

async function collection(identifiers: Array<Record<string, string>>): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = [];
  for (let i = 0; i < identifiers.length; i += CHUNK) {
    const cards = await fetchCollectionWithRetry(identifiers.slice(i, i + CHUNK));
    if (cards === null) throw new ResolveUnavailableError("Scryfall ist gerade nicht erreichbar");
    out.push(...cards);
    if (i + CHUNK < identifiers.length) await sleep(120);
  }
  return out;
}

function indexByName(cards: ScryfallCard[], into: Map<string, ScryfallCard>) {
  for (const card of cards) {
    into.set(card.name.toLowerCase(), card);
    // Doppelseitige Karten: Quelle enthält oft nur die Vorderseite.
    const front = card.name.split(" // ")[0];
    if (front !== card.name) into.set(front.toLowerCase(), card);
  }
}

// Auflösung in Stufen: Scryfall-ID → Set+Sammlernummer → exakter Name →
// Fuzzy-Name (einzeln, begrenzt). Ergebnis: Item-Index → Karte.
export async function resolveCards(items: ResolveInput[]): Promise<Map<number, ScryfallCard>> {
  const result = new Map<number, ScryfallCard>();

  // Jede Stufe: zuerst im eigenen Katalog, nur der Rest bei Scryfall.
  const withId = items.filter((it) => it.scryfallId);
  if (withId.length) {
    const ids = Array.from(new Set(withId.map((it) => it.scryfallId!.toLowerCase())));
    const byId = await catalogByIds(ids);
    const rest = ids.filter((id) => !byId.has(id));
    if (rest.length) for (const c of await collection(rest.map((id) => ({ id })))) byId.set(c.id.toLowerCase(), c);
    for (const it of withId) {
      const card = byId.get(it.scryfallId!.toLowerCase());
      if (card) result.set(it.i, card);
    }
  }

  const setCnKey = (set: string, cn: string) => `${set.toLowerCase()}|${cn}`;
  const bySetCnPending = items.filter((it) => !result.has(it.i) && it.set && it.collectorNumber);
  if (bySetCnPending.length) {
    const keys = new Map(bySetCnPending.map((it) => [setCnKey(it.set!, it.collectorNumber!), it]));
    const bySetCn = await catalogBySetNumber(Array.from(keys.values()).map((it) => ({ set: it.set!, number: it.collectorNumber! })));
    const rest = Array.from(keys.entries()).filter(([k]) => !bySetCn.has(k)).map(([, it]) => it);
    if (rest.length) {
      const cards = await collection(rest.map((it) => ({ set: it.set!.toLowerCase(), collector_number: it.collectorNumber! })));
      for (const c of cards) bySetCn.set(setCnKey(c.set, c.collector_number), c);
    }
    for (const it of bySetCnPending) {
      const card = bySetCn.get(setCnKey(it.set!, it.collectorNumber!));
      if (card) result.set(it.i, card);
    }
  }

  const namePending = items.filter((it) => !result.has(it.i) && it.name.trim());
  if (namePending.length) {
    const byName = new Map<string, ScryfallCard>();
    const names = Array.from(new Set(namePending.map((it) => it.name.trim())));
    // exakte Namen (auch deutsch) im Katalog – gleicher Standarddruck wie Scryfall
    for (const [n, card] of await catalogByNames(names)) byName.set(n, card);
    const notInCatalog = names.filter((n) => !byName.has(n.toLowerCase()));
    if (notInCatalog.length) indexByName(await collection(notInCatalog.map((name) => ({ name }))), byName);

    const missing = names.filter((n) => !byName.has(n.toLowerCase()));
    for (const name of missing.slice(0, MAX_FUZZY)) {
      const r = await fetchCardByName(name).catch(() => null);
      if (r?.card) byName.set(name.toLowerCase(), r.card);
      await sleep(100);
    }

    for (const it of namePending) {
      const card = byName.get(it.name.trim().toLowerCase());
      if (card) result.set(it.i, card);
    }
  }

  return result;
}
