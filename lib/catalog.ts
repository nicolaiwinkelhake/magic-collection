// Karten-Katalog (rein, getestet): Scryfall-Kartenobjekte aus der
// Gesamtdatei in kompakte Zeilen für die Tabelle catalog_cards bringen,
// gepackte JSONL-Dateien zeilenweise lesen und deutsche Namen bestimmen.

export { CATALOG_VERSION } from "@/lib/catalogState";

export type ScryCard = {
  id: string;
  oracle_id?: string;
  name: string;
  lang?: string;
  set: string;
  set_name?: string;
  collector_number: string;
  rarity?: string;
  layout?: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  oracle_text?: string;
  power?: string;
  toughness?: string;
  image_uris?: { normal?: string };
  card_faces?: Array<{ oracle_id?: string; name?: string; printed_name?: string; mana_cost?: string; type_line?: string; oracle_text?: string; colors?: string[]; image_uris?: { normal?: string }; power?: string; toughness?: string }>;
  prices?: { eur?: string | null; eur_foil?: string | null };
  released_at?: string;
  cardmarket_id?: number;
  frame?: string;
  border_color?: string;
  full_art?: boolean;
  promo?: boolean;
  finishes?: string[];
  games?: string[];
  printed_name?: string;
  produced_mana?: string[];
  edhrec_rank?: number;
  game_changer?: boolean;
  set_type?: string;
  frame_effects?: string[];
  promo_types?: string[];
  variation?: boolean;
  oversized?: boolean;
  textless?: boolean;
};

export type CatalogRow = {
  id: string;
  oracle_id: string | null;
  name: string;
  lang: string | null;
  set: string;
  set_name: string | null;
  collector_number: string;
  rarity: string | null;
  layout: string | null;
  type_line: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  image_url: string | null;
  eur: number | null;
  eur_foil: number | null;
  released_at: string | null;
  cardmarket_id: number | null;
  frame: string | null;
  border_color: string | null;
  full_art: boolean | null;
  promo: boolean | null;
  finishes: string[] | null;
  produced_mana: string[] | null;
  edhrec_rank: number | null;
  game_changer: boolean | null;
  set_type: string | null;
  frame_effects: string[] | null;
  promo_types: string[] | null;
  variation: boolean | null;
  oversized: boolean | null;
  textless: boolean | null;
  updated_at: string;
};

const price = (s: string | null | undefined) => (s ? Math.round(parseFloat(s) * 100) / 100 : null);

/** Nur echte Papierkarten (keine reinen Online-Karten). */
export function isPaper(c: ScryCard): boolean {
  return !c.games || c.games.includes("paper");
}

export function toCatalogRow(c: ScryCard, now: string): CatalogRow {
  const face = c.card_faces?.[0];
  const faces = c.card_faces ?? [];
  return {
    id: c.id,
    oracle_id: c.oracle_id ?? face?.oracle_id ?? null,
    name: c.name,
    lang: c.lang ?? null,
    set: c.set,
    set_name: c.set_name ?? null,
    collector_number: c.collector_number,
    rarity: c.rarity ?? null,
    layout: c.layout ?? null,
    type_line: c.type_line ?? face?.type_line ?? null,
    mana_cost: c.mana_cost || face?.mana_cost || null,
    cmc: typeof c.cmc === "number" ? c.cmc : null,
    colors: c.colors ?? face?.colors ?? null,
    color_identity: c.color_identity ?? null,
    oracle_text: c.oracle_text ?? (faces.length ? faces.map((f) => `${f.name ?? ""}\n${f.oracle_text ?? ""}`.trim()).join("\n\n") : null),
    power: c.power ?? face?.power ?? null,
    toughness: c.toughness ?? face?.toughness ?? null,
    image_url: c.image_uris?.normal ?? face?.image_uris?.normal ?? null,
    eur: price(c.prices?.eur),
    eur_foil: price(c.prices?.eur_foil),
    released_at: c.released_at ?? null,
    cardmarket_id: c.cardmarket_id ?? null,
    frame: c.frame ?? null,
    border_color: c.border_color ?? null,
    full_art: c.full_art ?? null,
    promo: c.promo ?? null,
    finishes: c.finishes ?? null,
    produced_mana: c.produced_mana ?? null,
    edhrec_rank: c.edhrec_rank ?? null,
    game_changer: c.game_changer ?? null,
    set_type: c.set_type ?? null,
    frame_effects: c.frame_effects ?? null,
    promo_types: c.promo_types ?? null,
    variation: c.variation ?? null,
    oversized: c.oversized ?? null,
    textless: c.textless ?? null,
    updated_at: now,
  };
}

/** Gepackten (gzip) Datenstrom zeilenweise lesen. */
const decoder = () => new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>;

/** Datenstrom (gzip oder ungepackt) zeilenweise lesen. */
export async function* streamLines(body: ReadableStream<Uint8Array>, gzip: boolean): AsyncGenerator<string> {
  const raw = gzip ? body.pipeThrough(new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>) : body;
  yield* textLines(raw.pipeThrough(decoder()));
}

export async function* textLines(text: ReadableStream<string>): AsyncGenerator<string> {
  const reader = text.getReader();
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest += value;
    let nl: number;
    while ((nl = rest.indexOf("\n")) >= 0) {
      const line = rest.slice(0, nl).trim();
      rest = rest.slice(nl + 1);
      if (line) yield line;
    }
  }
  if (rest.trim()) yield rest.trim();
}

/** Zeile der Gesamtdatei lesen (JSONL; verträgt auch das alte JSON-Array-Format). */
export function parseLine(line: string): ScryCard | null {
  const s = line.replace(/^\[/, "").replace(/[,\]]+$/, "").trim();
  if (!s.startsWith("{")) return null;
  try {
    return JSON.parse(s) as ScryCard;
  } catch {
    return null;
  }
}

/** Gedruckter deutscher Name der Vorderseite (null, wenn keiner/gleich dem englischen). */
export function germanName(c: ScryCard): string | null {
  if (c.lang !== "de") return null;
  const raw = c.printed_name ?? c.card_faces?.[0]?.printed_name;
  if (!raw) return null;
  const front = raw.split(" // ")[0].trim();
  const en = c.name.split(" // ")[0].trim();
  return front.length >= 2 && front !== en ? front : null;
}

/** Deutsche Namen je Oracle-ID sammeln; gewählt wird der häufigste Druck-Name. */
export class GermanNames {
  private counts = new Map<string, Map<string, number>>();
  add(c: ScryCard) {
    const de = germanName(c);
    if (!de || !c.oracle_id) return;
    const m = this.counts.get(c.oracle_id) ?? new Map<string, number>();
    m.set(de, (m.get(de) ?? 0) + 1);
    this.counts.set(c.oracle_id, m);
  }
  result(): Array<{ oracle_id: string; name_de: string }> {
    return Array.from(this.counts, ([oracle_id, m]) => ({
      oracle_id,
      name_de: [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }));
  }
}
