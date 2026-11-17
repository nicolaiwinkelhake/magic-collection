// Deutsche Kartennamen im Browser: einmal laden (~0,5 MB, vom Browser
// zwischengespeichert), dann werden deutsche Karten ohne Netz erkannt.
import { buildGermanIndex, type GermanIndex } from "@/lib/germanIndex";

const URL_DE = "/data/de-names.json";
let ready: GermanIndex | null = null;
let loading: Promise<GermanIndex | null> | null = null;

export function loadGermanIndex(): Promise<GermanIndex | null> {
  if (ready) return Promise.resolve(ready);
  loading ??= (async () => {
    const res = await fetch(URL_DE);
    if (!res.ok) return null;
    const body = (await res.json()) as { names?: Array<[string, string]> };
    if (!body.names?.length) return null;
    ready = buildGermanIndex(body.names);
    return ready;
  })()
    .catch(() => null)
    .finally(() => {
      if (!ready) loading = null; // später erneut versuchen
    });
  return loading;
}

export function germanIndexIfReady(): GermanIndex | null {
  return ready;
}
