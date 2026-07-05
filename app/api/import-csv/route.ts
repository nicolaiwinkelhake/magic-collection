import { createClient } from "@/lib/supabase/server";
const SCRYFALL_BASE = "https://api.scryfall.com";
const CHUNK = 75;

export const maxDuration = 120;

// Importiert Karten anhand von Scryfall-IDs (aus Moxfield-/ManaBox-CSV).
// Erwartet { entries: [{ scryfallId, name, quantity, foil }] }.
// Antwort ist NDJSON (ein JSON-Objekt pro Zeile) mit Fortschritts-Events,
// analog zu /api/import.
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
  const entries: Array<{ scryfallId: string; name: string; quantity: number; foil: boolean }> =
    body.entries ?? [];
  const allowDuplicates: boolean = body.allowDuplicates ?? false;
  if (!entries.length) {
    return new Response(JSON.stringify({ error: "Keine Einträge" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: unknown) {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      }

      // Daten von Scryfall per Bulk-API holen (75 IDs pro Request)
      const scryfallMap = new Map<string, Record<string, unknown>>();
      let resolvedCount = 0;
      const total = entries.length;
      send({ type: "progress", done: 0, total });

      for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        const identifiers = chunk.map((e) => ({ id: e.scryfallId }));
        const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "MagicCollectionApp/1.0" },
          body: JSON.stringify({ identifiers }),
        });
        if (res.ok) {
          const data = await res.json();
          for (const card of (data.data ?? []) as Record<string, unknown>[]) {
            scryfallMap.set(card.id as string, card);
          }
        }
        resolvedCount += chunk.length;
        send({ type: "progress", done: resolvedCount, total });
        if (i + CHUNK < entries.length) await new Promise((r) => setTimeout(r, 100));
      }

      let imported = 0;
      const notFound: string[] = [];
      const skipped: string[] = [];
      let done = 0;

      for (const entry of entries) {
        done += 1;
        const card = scryfallMap.get(entry.scryfallId);
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
