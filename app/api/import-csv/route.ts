import { createClient } from "@/lib/supabase/server";
const SCRYFALL_BASE = "https://api.scryfall.com";
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

type ScryfallCardData = Record<string, unknown>;

// Scryfall-Batch mit Retry: transiente Fehler (429/5xx/Netzwerk) führten
// bisher dazu, dass ein kompletter 75er-Block stillschweigend übersprungen
// wurde und alle Karten darin fälschlich als "nicht gefunden" galten.
async function fetchCollectionWithRetry(
  identifiers: Array<Record<string, string>>
): Promise<ScryfallCardData[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "MagicCollectionApp/1.0" },
        body: JSON.stringify({ identifiers }),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.data ?? []) as ScryfallCardData[];
      }
    } catch {
      // Netzwerkfehler -> Retry
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  return null;
}

// Importiert Karten anhand von Scryfall-IDs (aus Moxfield-/ManaBox-CSV).
// Erwartet { entries: [{ scryfallId, name, quantity, foil, set?, collectorNumber? }] }.
// Auflösung in drei Stufen: Scryfall-ID -> Set+Sammlernummer -> Name.
// Antwort ist NDJSON (ein JSON-Objekt pro Zeile) mit Fortschritts-Events.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Nicht angemeldet" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const rawEntries: ImportEntry[] = body.entries ?? [];
  const allowDuplicates: boolean = body.allowDuplicates ?? false;
  if (!rawEntries.length) {
    return new Response(JSON.stringify({ error: "Keine Einträge" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Gleiche Karte (ID + Foil) kann mehrfach in der CSV stehen (z. B. pro
  // Zustand/Sprache eine Zeile). Mengen zusammenfassen, sonst wird die
  // zweite Zeile als "schon vorhanden" übersprungen statt addiert.
  const byKey = new Map<string, ImportEntry>();
  for (const e of rawEntries) {
    if (!e.scryfallId?.trim()) continue;
    const key = `${e.scryfallId.trim()}|${e.foil ? 1 : 0}`;
    const existing = byKey.get(key);
    if (existing) existing.quantity += Math.max(1, e.quantity ?? 1);
    else byKey.set(key, { ...e, scryfallId: e.scryfallId.trim(), quantity: Math.max(1, e.quantity ?? 1) });
  }
  const entries = Array.from(byKey.values());

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      const total = entries.length;
      send({ type: "progress", done: 0, total });

      // Stufe 1: Auflösung per Scryfall-ID (exakt).
      const byId = new Map<string, ScryfallCardData>();
      let resolvedCount = 0;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        const cards = await fetchCollectionWithRetry(chunk.map((e) => ({ id: e.scryfallId })));
        for (const card of cards ?? []) byId.set(card.id as string, card);
        resolvedCount += chunk.length;
        send({ type: "progress", done: Math.min(resolvedCount, total), total });
        if (i + CHUNK < entries.length) await new Promise((r) => setTimeout(r, 120));
      }

      // Stufe 2: Übrige per Set-Code + Sammlernummer (fängt veraltete IDs ab).
      const pending = entries.filter((e) => !byId.has(e.scryfallId));
      const bySetCn = new Map<string, ScryfallCardData>();
      const setCnPending = pending.filter((e) => e.set && e.collectorNumber);
      for (let i = 0; i < setCnPending.length; i += CHUNK) {
        const chunk = setCnPending.slice(i, i + CHUNK);
        const cards = await fetchCollectionWithRetry(
          chunk.map((e) => ({ set: e.set!.toLowerCase(), collector_number: e.collectorNumber! }))
        );
        for (const card of cards ?? []) {
          bySetCn.set(`${(card.set as string).toLowerCase()}|${card.collector_number as string}`, card);
        }
        if (i + CHUNK < setCnPending.length) await new Promise((r) => setTimeout(r, 120));
      }

      // Stufe 3: Rest per Kartenname (irgendein Druck ist besser als keiner).
      const resolveEntry = (e: ImportEntry): ScryfallCardData | undefined =>
        byId.get(e.scryfallId) ??
        (e.set && e.collectorNumber ? bySetCn.get(`${e.set.toLowerCase()}|${e.collectorNumber}`) : undefined);

      const namePending = pending.filter((e) => !resolveEntry(e) && e.name);
      const byName = new Map<string, ScryfallCardData>();
      for (let i = 0; i < namePending.length; i += CHUNK) {
        const chunk = namePending.slice(i, i + CHUNK);
        const cards = await fetchCollectionWithRetry(chunk.map((e) => ({ name: e.name })));
        for (const card of cards ?? []) byName.set((card.name as string).toLowerCase(), card);
        if (i + CHUNK < namePending.length) await new Promise((r) => setTimeout(r, 120));
      }
      const resolveByName = (name: string): ScryfallCardData | undefined => {
        const lower = name.toLowerCase();
        if (byName.has(lower)) return byName.get(lower);
        // Doppelseitige Karten: CSV enthält oft nur die Vorderseite ("A"),
        // Scryfall liefert "A // B".
        for (const [key, card] of byName) {
          if (key.startsWith(`${lower} //`)) return card;
        }
        return undefined;
      };

      let imported = 0;
      const notFound: string[] = [];
      const skipped: string[] = [];
      let done = 0;

      for (const entry of entries) {
        done += 1;
        const card = resolveEntry(entry) ?? resolveByName(entry.name);
        if (!card) {
          notFound.push(entry.name);
          send({ type: "progress", done, total });
          continue;
        }

        const imageUris = card.image_uris as Record<string, string> | undefined;
        const cardFaces = card.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
        const imageUrl = imageUris?.normal ?? cardFaces?.[0]?.image_uris?.normal ?? null;

        const rawPrices = card.prices as Record<string, string | null> | undefined;
        const eur = rawPrices?.eur ? parseFloat(rawPrices.eur) : null;
        const eurFoil = rawPrices?.eur_foil ? parseFloat(rawPrices.eur_foil) : null;

        const row = {
          user_id: user.id,
          scryfall_id: card.id as string,
          name: card.name as string,
          set_code: card.set as string,
          collector_number: card.collector_number as string,
          image_url: imageUrl,
          mana_cost: (card.mana_cost as string | null) ?? null,
          cmc: (card.cmc as number) ?? 0,
          type_line: card.type_line as string,
          colors: (card.colors as string[]) ?? [],
          rarity: card.rarity as string,
          oracle_text: (card.oracle_text as string | null) ?? null,
          quantity: entry.quantity,
          foil: entry.foil,
          price_eur: eur,
          price_eur_foil: eurFoil,
          price_updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
          .from("cards")
          .select("id, quantity")
          .eq("user_id", user.id)
          .eq("scryfall_id", card.id as string)
          .eq("foil", entry.foil)
          .maybeSingle();

        if (existing) {
          if (!allowDuplicates) {
            if (!skipped.includes(card.name as string)) skipped.push(card.name as string);
            send({ type: "progress", done, total });
            continue;
          }
          await supabase
            .from("cards")
            .update({
              quantity: existing.quantity + entry.quantity,
              price_eur: eur,
              price_eur_foil: eurFoil,
              price_updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("cards").insert(row);
        }

        await supabase.rpc("record_card_price", {
          p_scryfall_id: card.id as string,
          p_eur: eur,
          p_eur_foil: eurFoil,
        });

        imported += entry.quantity;
        send({ type: "progress", done, total });
      }

      await supabase.rpc("snapshot_collection_value");

      send({ type: "result", imported, notFound, skipped });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
