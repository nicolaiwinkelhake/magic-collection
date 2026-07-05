import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, getPrices, sleep } from "@/lib/scryfall";

export const maxDuration = 120;

// Erwartet { entries: [{ name, quantity, foil? }] }.
// Karten werden über die Unique-Bedingung (user, scryfall_id, foil)
// zusammengeführt: vorhandene Mengen werden erhöht statt Duplikate anzulegen.
//
// Antwort ist NDJSON (ein JSON-Objekt pro Zeile), damit der Client den
// Fortschritt ("X von Y Karten") live anzeigen kann, statt nur auf eine
// einzelne Antwort am Ende zu warten.
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
  const entries: Array<{ name: string; quantity?: number; foil?: boolean }> =
    body.entries ?? [];
  const allowDuplicates: boolean = body.allowDuplicates ?? false;

  if (!entries.length) {
    return new Response(JSON.stringify({ error: "Keine Karten übergeben" }), {
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

      const notFound: string[] = [];
      const skipped: string[] = [];
      let imported = 0;

      const uniqueNames = Array.from(new Set(entries.map((e) => e.name.trim()).filter(Boolean)));
      const resolved = new Map<string, Awaited<ReturnType<typeof fetchCardByName>>>();

      let done = 0;
      const total = uniqueNames.length;
      send({ type: "progress", done, total });

      for (const name of uniqueNames) {
        resolved.set(name, await fetchCardByName(name));
        done += 1;
        send({ type: "progress", done, total });
        await sleep(100);
      }

      for (const entry of entries) {
        const name = entry.name.trim();
        if (!name) continue;
        const r = resolved.get(name);
        const qty = Math.max(1, entry.quantity ?? 1);
        const foil = entry.foil ?? false;

        if (!r?.card) {
          if (!notFound.includes(name)) notFound.push(name);
          continue;
        }

        const { eur, eurFoil } = getPrices(r.card);

        const { data: existing } = await supabase
          .from("cards")
          .select("id, quantity")
          .eq("user_id", user.id)
          .eq("scryfall_id", r.card.id)
          .eq("foil", foil)
          .maybeSingle();

        if (existing) {
          if (!allowDuplicates) {
            if (!skipped.includes(r.card.name)) skipped.push(r.card.name);
            continue;
          }
          await supabase
            .from("cards")
            .update({
              quantity: existing.quantity + qty,
              price_eur: eur,
              price_eur_foil: eurFoil,
              price_updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("cards").insert({
            user_id: user.id,
            scryfall_id: r.card.id,
            name: r.card.name,
            set_code: r.card.set,
            collector_number: r.card.collector_number,
            image_url: r.imageUrl,
            mana_cost: r.card.mana_cost ?? null,
            cmc: r.card.cmc,
            type_line: r.card.type_line,
            colors: r.card.colors ?? [],
            rarity: r.card.rarity,
            oracle_text: r.card.oracle_text ?? null,
            quantity: qty,
            foil,
            price_eur: eur,
            price_eur_foil: eurFoil,
            price_updated_at: new Date().toISOString(),
          });
        }

        await supabase.rpc("record_card_price", {
          p_scryfall_id: r.card.id,
          p_eur: eur,
          p_eur_foil: eurFoil,
        });

        imported += qty;
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
