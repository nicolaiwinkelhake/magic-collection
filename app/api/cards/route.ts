import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCollectionWithRetry, getPrices } from "@/lib/scryfall";
import { planMove, samePrintFamily } from "@/lib/cardMove";

// Menge/Foil/Zustand/Sprache/Druck einer Sammlungskarte ändern.
export async function PATCH(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { id, quantity, foil, condition, language, scryfallId } = await request.json();
  if (!id) return NextResponse.json({ error: "Keine Karte angegeben" }, { status: 400 });

  const { data: row, error: rowError } = await supabase
    .from("cards")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (rowError) return NextResponse.json({ error: rowError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Karte nicht gefunden" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (quantity !== undefined) {
    const q = Math.max(0, parseInt(quantity, 10) || 0);
    if (q === 0) {
      // Menge 0 -> Karte entfernen
      await supabase.from("cards").delete().eq("id", id).eq("user_id", user.id);
      await supabase.rpc("snapshot_collection_value");
      return NextResponse.json({ deleted: true });
    }
    updates.quantity = q;
  }
  if (condition !== undefined) updates.condition = condition;
  if (language !== undefined) updates.language = language;

  // Druck wechseln: neuen Druck bei Scryfall holen und prüfen, dass er zur
  // selben Karte gehört (kein versehentliches Umbuchen auf eine andere Karte).
  const targetFoil = foil !== undefined ? Boolean(foil) : (row.foil as boolean);
  let targetId = row.scryfall_id as string;
  if (scryfallId && scryfallId !== row.scryfall_id) {
    const cards = await fetchCollectionWithRetry([{ id: String(scryfallId) }, { id: String(row.scryfall_id) }]);
    if (cards === null) {
      return NextResponse.json({ error: "Scryfall ist gerade nicht erreichbar – bitte gleich erneut versuchen." }, { status: 503 });
    }
    const next = cards.find((c) => c.id === scryfallId);
    const current = cards.find((c) => c.id === row.scryfall_id);
    if (!next) return NextResponse.json({ error: "Diesen Druck gibt es bei Scryfall nicht." }, { status: 404 });
    if (!samePrintFamily(next, current ?? { name: row.name as string })) {
      return NextResponse.json({ error: `„${next.name}“ ist eine andere Karte als „${row.name}“.` }, { status: 400 });
    }
    const { eur, eurFoil } = getPrices(next);
    Object.assign(updates, {
      scryfall_id: next.id,
      name: next.name,
      set_code: next.set,
      collector_number: next.collector_number,
      rarity: next.rarity,
      image_url: next.image_uris?.normal ?? next.card_faces?.[0]?.image_uris?.normal ?? null,
      mana_cost: next.mana_cost ?? null,
      cmc: next.cmc ?? 0,
      type_line: next.type_line,
      colors: next.colors ?? [],
      oracle_text: next.oracle_text ?? null,
      price_eur: eur,
      price_eur_foil: eurFoil,
      price_updated_at: new Date().toISOString(),
    });
    targetId = next.id;
  }
  if (foil !== undefined) updates.foil = targetFoil;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
  }

  // Gibt es (Druck + Foil) schon als eigene Zeile? Dann zusammenlegen.
  const { data: existing } = await supabase
    .from("cards")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("scryfall_id", targetId)
    .eq("foil", targetFoil)
    .neq("id", id)
    .maybeSingle();
  const plan = planMove(
    { id, scryfall_id: row.scryfall_id, foil: row.foil, quantity: (updates.quantity as number) ?? row.quantity },
    { scryfall_id: targetId, foil: targetFoil },
    existing ?? null,
  );

  if (plan.kind === "merge") {
    // 1) Menge ins Ziel buchen, 2) alte Zeile löschen. Schlägt 2) fehl,
    // wird 1) zurückgenommen – so entsteht nie eine doppelt gezählte Karte.
    const { error: upErr } = await supabase
      .from("cards")
      .update({ quantity: plan.quantity })
      .eq("id", plan.targetId)
      .eq("user_id", user.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    // Ordner-Zuordnungen auf die Zielzeile übertragen (Migration 015)
    const { data: entries } = await supabase.from("folder_entries").select("folder_id").eq("card_id", id);
    if (entries?.length) {
      await supabase.from("folder_entries").upsert(
        entries.map((e) => ({ user_id: user.id, folder_id: e.folder_id, card_id: plan.targetId })),
        { onConflict: "folder_id,card_id", ignoreDuplicates: true },
      );
    }
    const { error: delErr } = await supabase.from("cards").delete().eq("id", id).eq("user_id", user.id);
    if (delErr) {
      await supabase.from("cards").update({ quantity: existing!.quantity }).eq("id", plan.targetId).eq("user_id", user.id);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    const { data: merged } = await supabase.from("cards").select("*").eq("id", plan.targetId).maybeSingle();
    await supabase.rpc("snapshot_collection_value");
    return NextResponse.json({ ok: true, mergedInto: plan.targetId, card: merged });
  }

  const { data: updated, error } = await supabase
    .from("cards")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (updates.price_eur !== undefined) {
    await supabase.rpc("record_card_price", {
      p_scryfall_id: targetId,
      p_eur: updates.price_eur,
      p_eur_foil: updates.price_eur_foil,
    });
  }
  await supabase.rpc("snapshot_collection_value");
  return NextResponse.json({ ok: true, card: updated });
}

// Eine Karte ({ id }) oder mehrere ({ ids: [...] }) löschen – für Bulk-Aktionen.
export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids
    : body.id
      ? [body.id]
      : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Keine IDs angegeben" }, { status: 400 });
  }

  const { error } = await supabase
    .from("cards")
    .delete()
    .in("id", ids)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.rpc("snapshot_collection_value");
  return NextResponse.json({ deleted: ids.length });
}
