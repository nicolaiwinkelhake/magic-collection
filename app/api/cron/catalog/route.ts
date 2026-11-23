import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CATALOG_VERSION, GermanNames, isPaper, parseLine, streamLines, toCatalogRow, type CatalogRow } from "@/lib/catalog";
import { isTransient } from "@/lib/catalogState";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Karten-Katalog abgleichen: alle Magic-Drucke aus der Scryfall-Gesamtdatei
// in catalog_cards schreiben (täglich), deutsche Namen aus der Gesamtdatei
// aller Sprachen (wöchentlich bzw. beim ersten Mal).
// - Vercel Cron (Bearer CRON_SECRET) oder ein angemeldeter Admin (app_admins)
// - fortsetzbar: Wird das Zeitlimit knapp, merkt sich der Abgleich die Zeile
//   und ruft sich selbst mit ?from=… erneut auf.
// - Unveränderte Gesamtdatei (gleicher Stand wie beim letzten vollständigen
//   Abgleich) wird übersprungen, außer mit ?force=1.

const BUDGET_MS = 240_000;
const BATCH = 250;
const PARALLEL = 2;
const MAX_RETRIES = 6;
const RETRY_PAUSE_MS = 15_000;
const UA = { "User-Agent": "MagicCollectionApp/1.0", Accept: "application/json" };

type Bulk = { updated_at: string; jsonl_download_uri?: string; download_uri?: string };
type Meta = { updated_at?: string; done?: boolean; next?: number; rows?: number; finished_at?: string; error?: string; version?: number };

async function bulkInfo(type: string): Promise<Bulk> {
  const res = await fetch(`https://api.scryfall.com/bulk-data/${type}`, { headers: UA, cache: "no-store" });
  if (!res.ok) throw new Error(`Scryfall bulk-data ${type}: ${res.status}`);
  return res.json();
}

async function getMeta(db: SupabaseClient, key: string): Promise<Meta> {
  const { data } = await db.from("catalog_meta").select("value").eq("key", key).maybeSingle();
  return (data?.value as Meta) ?? {};
}
async function setMeta(db: SupabaseClient, key: string, value: Meta) {
  await db.from("catalog_meta").upsert({ key, value, updated_at: new Date().toISOString() });
  // erfolgreich abgeschlossen → alten Fehlerhinweis dieses Teils entfernen
  if (value.done) await db.from("catalog_meta").delete().eq("key", `${key}_error`);
}

/** Nächsten Teil im Hintergrund anstoßen (eigene Anfrage, eigenes Zeitlimit). */
async function chain(origin: string, params: Record<string, string>) {
  const url = `${origin}/api/cron/catalog?${new URLSearchParams(params)}`;
  await fetch(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(3000) }).catch(() => {});
}

async function authorized(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  // angemeldeter Admin (z. B. "Katalog jetzt abgleichen" in den Einstellungen)
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !!data;
}

/** Block speichern; bei Zeitüberschreitung o. Ä. halbieren und erneut versuchen. */
async function saveRows(db: SupabaseClient, rows: CatalogRow[], depth = 0): Promise<void> {
  const { error } = await db.from("catalog_cards").upsert(rows, { onConflict: "id" });
  if (!error) return;
  if (depth >= 4 || rows.length < 2) {
    // letzter Versuch nach kurzer Pause
    await new Promise((r) => setTimeout(r, 1500));
    const again = await db.from("catalog_cards").upsert(rows, { onConflict: "id" });
    if (again.error) throw new Error(`Speichern: ${again.error.message}`);
    return;
  }
  const mid = Math.ceil(rows.length / 2);
  await saveRows(db, rows.slice(0, mid), depth + 1);
  await saveRows(db, rows.slice(mid), depth + 1);
}

async function syncCards(db: SupabaseClient, origin: string, from: number, force: boolean, started: number) {
  const bulk = await bulkInfo("default-cards");
  const meta = await getMeta(db, "cards");
  if (!force && from === 0 && meta.done && meta.updated_at === bulk.updated_at && meta.version === CATALOG_VERSION) return { skipped: true, updated_at: bulk.updated_at };
  const uri = bulk.jsonl_download_uri ?? bulk.download_uri;
  if (!uri) throw new Error("Keine Download-Adresse für default-cards");
  const res = await fetch(uri, { headers: { "User-Agent": UA["User-Agent"] }, cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`Gesamtdatei: ${res.status}`);
  const gz = uri.endsWith(".gz");
  const now = new Date().toISOString();
  let line = 0;
  let rows = meta.updated_at === bulk.updated_at && from > 0 ? meta.rows ?? 0 : 0;
  let batch: CatalogRow[] = [];
  const inFlight = new Set<Promise<void>>();
  const flush = async () => {
    if (!batch.length) return;
    const chunk = batch;
    batch = [];
    const p = saveRows(db, chunk);
    inFlight.add(p);
    p.finally(() => inFlight.delete(p)).catch(() => {});
    if (inFlight.size >= PARALLEL) await Promise.race(inFlight);
  };
  const lines = streamLines(res.body, gz);
  for await (const l of lines) {
    line++;
    if (line <= from) continue;
    const c = parseLine(l);
    if (!c || !isPaper(c)) continue;
    batch.push(toCatalogRow(c, now));
    rows++;
    if (batch.length >= BATCH) await flush();
    if (Date.now() - started > BUDGET_MS) {
      await flush();
      await Promise.all(inFlight);
      // finished_at/version vom letzten vollständigen Lauf bleiben stehen: Der Katalog bleibt nutzbar, solange er neu aufgebaut wird
      await setMeta(db, "cards", { updated_at: bulk.updated_at, done: false, next: line, rows, version: meta.version, finished_at: meta.finished_at });
      await chain(origin, { part: "cards", from: String(line), ...(force ? { force: "1" } : {}) });
      return { continued: true, line, rows };
    }
  }
  await flush();
  await Promise.all(inFlight);
  await setMeta(db, "cards", { updated_at: bulk.updated_at, done: true, rows, finished_at: new Date().toISOString(), version: CATALOG_VERSION });
  return { done: true, rows, updated_at: bulk.updated_at };
}

/** Standarddruck je Karte (wie Scryfalls Namenssuche) aus "oracle_cards". */
async function syncDefaults(db: SupabaseClient, started: number) {
  const bulk = await bulkInfo("oracle-cards");
  const uri = bulk.jsonl_download_uri ?? bulk.download_uri;
  if (!uri) throw new Error("Keine Download-Adresse für oracle-cards");
  const res = await fetch(uri, { headers: { "User-Agent": UA["User-Agent"] }, cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`Gesamtdatei (Standarddrucke): ${res.status}`);
  const now = new Date().toISOString();
  let batch: Array<{ oracle_id: string; card_id: string; updated_at: string }> = [];
  let rows = 0;
  let overviewError: string | null = null;
  const flush = async () => {
    if (!batch.length) return;
    const { error } = await db.from("catalog_defaults").upsert(batch, { onConflict: "oracle_id" });
    if (error) throw new Error(`Standarddrucke speichern: ${error.message}`);
    // Kartenübersicht für die Seite „Katalog“ (eine Zeile je Karte) gleich mit auffrischen –
    // in kleinen Paketen (Zeitgrenze der Datenbank). Fehler hier stoppen den Abgleich nicht.
    const ids = batch.map((b) => b.card_id);
    for (let i = 0; i < ids.length; i += 250) {
      const { error: e } = await db.rpc("catalog_oracle_refresh", { p_card_ids: ids.slice(i, i + 250) });
      if (e) overviewError = e.message;
    }
    batch = [];
  };
  for await (const l of streamLines(res.body, uri.endsWith(".gz"))) {
    const c = parseLine(l);
    const oracle = c?.oracle_id ?? c?.card_faces?.[0]?.oracle_id;
    if (!c || !oracle || !isPaper(c)) continue;
    batch.push({ oracle_id: oracle, card_id: c.id, updated_at: now });
    rows++;
    if (batch.length >= 1000) await flush();
    if (Date.now() - started > 285_000) throw new Error("Zeitlimit bei den Standarddrucken");
  }
  await flush();
  await setMeta(db, "defaults", { updated_at: bulk.updated_at, done: true, rows, finished_at: new Date().toISOString() });
  if (overviewError) await setMeta(db, "overview_error", { error: `Kartenübersicht: ${overviewError}`, finished_at: new Date().toISOString() });
  return { defaults: rows, ...(overviewError ? { overviewError } : {}) };
}

async function syncNames(db: SupabaseClient, started: number) {
  const bulk = await bulkInfo("all-cards");
  const uri = bulk.jsonl_download_uri ?? bulk.download_uri;
  if (!uri) throw new Error("Keine Download-Adresse für all-cards");
  const res = await fetch(uri, { headers: { "User-Agent": UA["User-Agent"] }, cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`Gesamtdatei (alle Sprachen): ${res.status}`);
  const names = new GermanNames();
  const lines = streamLines(res.body, uri.endsWith(".gz"));
  for await (const l of lines) {
    // schnell vorsortieren: nur deutsche Drucke überhaupt lesen
    if (!l.includes('"lang":"de"')) continue;
    const c = parseLine(l);
    if (c) names.add(c);
    if (Date.now() - started > 285_000) throw new Error("Zeitlimit beim Lesen der deutschen Namen");
  }
  const list = names.result();
  let changed = 0;
  for (let i = 0; i < list.length; i += 2000) {
    const { data, error } = await db.rpc("catalog_set_names", { p: list.slice(i, i + 2000) });
    if (error) throw new Error(`Deutsche Namen: ${error.message}`);
    changed += Number(data ?? 0);
  }
  await setMeta(db, "names", { updated_at: bulk.updated_at, done: true, rows: list.length, finished_at: new Date().toISOString() });
  return { names: list.length, changed };
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  const url = new URL(request.url);
  // Wiederholung nach einem Engpass der Datenbank: erst eine Pause (wächst mit jedem Versuch, bleibt unter dem Zeitlimit)
  const retry = Math.max(0, Number(url.searchParams.get("retry") ?? 0) || 0);
  if (retry) await new Promise((r) => setTimeout(r, Math.min(retry * RETRY_PAUSE_MS, 45_000)));
  const started = Date.now();
  const part = url.searchParams.get("part") ?? "cards";
  const from = Math.max(0, Number(url.searchParams.get("from") ?? 0) || 0);
  const force = url.searchParams.get("force") === "1";
  const db = createAdminClient();
  try {
    if (part === "names") return NextResponse.json(await syncNames(db, started));
    if (part === "defaults") {
      const result = await syncDefaults(db, started);
      // danach deutsche Namen: sonntags oder wenn noch nie gemacht (eigene Anfrage)
      const names = await getMeta(db, "names");
      if (url.searchParams.get("names") === "1" || !names.done || new Date().getUTCDay() === 0) await chain(url.origin, { part: "names" });
      return NextResponse.json(result);
    }
    const result = await syncCards(db, url.origin, from, force, started);
    // Reihenfolge: Karten → Standarddrucke → (deutsche Namen), je eigene Anfrage
    const defaultsDone = (await getMeta(db, "defaults")).done;
    if (!("continued" in result) && (!("skipped" in result) || !defaultsDone)) await chain(url.origin, { part: "defaults", ...(force ? { names: "1" } : {}) });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setMeta(db, `${part}_error`, { error: message, finished_at: new Date().toISOString() }).catch(() => {});
    // Zeitüberschreitungen der Datenbank sind meist kurzfristig: vom zuletzt gemerkten Stand aus erneut versuchen,
    // statt bis zur nächsten Nacht stehenzubleiben. Speichern ist wiederholbar (Upsert).
    if (part === "cards" && retry < MAX_RETRIES && isTransient(message)) {
      const meta = await getMeta(db, "cards").catch(() => ({}) as Meta);
      await chain(url.origin, { part: "cards", from: String(meta.done ? 0 : meta.next ?? from), retry: String(retry + 1), ...(force ? { force: "1" } : {}) });
    }
    return NextResponse.json({ error: message, retry }, { status: 500 });
  }
}
