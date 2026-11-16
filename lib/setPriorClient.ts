// Bekannte Set-Kürzel im Browser: korrigiert verlesene Kürzel in der
// Infozeile ("TOM" → "TDM"). Alle Sets kommen einmal von Scryfall (kompakt
// im Gerätespeicher, 7 Tage); die eigenen Sets (Sammlung) zählen am meisten,
// neue Sets etwas mehr als alte.
import type { SetPrior } from "@/lib/ocr";

const URL_SETS = "https://api.scryfall.com/sets";
const CACHE_NAME = "mtg-data-v1";
const CACHE_KEY = "/_data/sets-compact";
const MAX_AGE_MS = 7 * 86400_000;

type Compact = Array<[code: string, released: string]>;

let ready: SetPrior | null = null;
let loading: Promise<SetPrior | null> | null = null;

/** Gewichte: eigene Karten je Set + kleiner Bonus für neuere Sets (rein, getestet). */
export function buildSetPrior(sets: Compact, own: Record<string, number>, today = new Date()): SetPrior {
  const prior: SetPrior = new Map();
  const year = today.getFullYear();
  for (const [code, released] of sets) {
    const age = Math.max(0, year - Number(released.slice(0, 4) || 1993));
    prior.set(code.toLowerCase(), (own[code.toLowerCase()] ?? 0) + 1 / (1 + age));
  }
  return prior;
}

async function loadSets(): Promise<Compact | null> {
  let cached: { sets: Compact; at: number } | null = null;
  try {
    const res = await (await caches.open(CACHE_NAME)).match(CACHE_KEY);
    if (res) cached = (await res.json()) as { sets: Compact; at: number };
  } catch {
    // kein Gerätespeicher
  }
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return cached.sets;
  try {
    const res = await fetch(URL_SETS, { headers: { Accept: "application/json" } });
    if (!res.ok) return cached?.sets ?? null;
    const body = (await res.json()) as { data?: Array<{ code: string; released_at?: string }> };
    const sets: Compact = (body.data ?? []).map((s) => [s.code, s.released_at ?? ""]);
    if (!sets.length) return cached?.sets ?? null;
    try {
      await (await caches.open(CACHE_NAME)).put(CACHE_KEY, new Response(JSON.stringify({ sets, at: Date.now() }), { headers: { "Content-Type": "application/json" } }));
    } catch {
      // nur für diese Sitzung
    }
    return sets;
  } catch {
    return cached?.sets ?? null;
  }
}

/** Einmal je Sitzung laden; null, wenn nicht verfügbar (dann ohne Korrektur). */
export function loadSetPrior(): Promise<SetPrior | null> {
  if (ready) return Promise.resolve(ready);
  loading ??= (async () => {
    const [sets, own] = await Promise.all([
      loadSets(),
      fetch("/api/scan/sets")
        .then((r) => (r.ok ? (r.json() as Promise<{ sets?: Record<string, number> }>) : null))
        .catch(() => null),
    ]);
    if (!sets) return null;
    ready = buildSetPrior(sets, own?.sets ?? {});
    return ready;
  })().finally(() => {
    if (!ready) loading = null;
  });
  return loading;
}

export function setPriorIfReady(): SetPrior | undefined {
  return ready ?? undefined;
}
