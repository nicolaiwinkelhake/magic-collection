// Kartennamen-Wörterbuch im Browser laden: einmal von Scryfall (~250 KB),
// dann aus dem Gerätespeicher (Cache Storage, 7 Tage). Wird beim Öffnen der
// Scan-Seite im Leerlauf vorbereitet, damit es beim ersten Scan bereitsteht.
import { buildNameIndex, type NameIndex } from "@/lib/nameIndex";

const URL_NAMES = "https://api.scryfall.com/catalog/card-names";
const CACHE_NAME = "mtg-data-v1";
const MAX_AGE_MS = 7 * 86400_000;

let ready: NameIndex | null = null;
let loading: Promise<NameIndex | null> | null = null;

async function fromCache(): Promise<{ names: string[]; fresh: boolean } | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(URL_NAMES);
    if (!res) return null;
    const at = Number(res.headers.get("x-fetched-at") ?? 0);
    const names = ((await res.json()) as { data?: string[] }).data ?? [];
    return names.length ? { names, fresh: Date.now() - at < MAX_AGE_MS } : null;
  } catch {
    return null;
  }
}

async function fromNetwork(): Promise<string[] | null> {
  try {
    const res = await fetch(URL_NAMES, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: string[] };
    const names = body.data ?? [];
    if (!names.length) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        URL_NAMES,
        new Response(JSON.stringify({ data: names }), { headers: { "Content-Type": "application/json", "x-fetched-at": String(Date.now()) } }),
      );
    } catch {
      // Speicher voll/gesperrt: dann eben nur für diese Sitzung
    }
    return names;
  } catch {
    return null;
  }
}

/** Wörterbuch laden (einmal je Sitzung); null, wenn nicht verfügbar. */
export function loadNameIndex(): Promise<NameIndex | null> {
  if (ready) return Promise.resolve(ready);
  loading ??= (async () => {
    const cached = await fromCache();
    let names = cached?.fresh ? cached.names : null;
    if (!names) names = (await fromNetwork()) ?? cached?.names ?? null;
    if (!names) return null;
    ready = buildNameIndex(names);
    return ready;
  })().catch(() => null).finally(() => {
    if (!ready) loading = null; // später erneut versuchen
  });
  return loading;
}

/** Sofort verfügbar? (für den Scan-Takt – nie warten) */
export function nameIndexIfReady(): NameIndex | null {
  return ready;
}
