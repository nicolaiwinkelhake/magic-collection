import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardsCollection } from "@/lib/scryfall";
import { loadCommanderLists } from "@/lib/commanderData";
import { selectAll } from "@/lib/supabase/selectAll";
import { countRoles, ROLE_LABEL, ROLE_TARGETS, type CardRole } from "@/lib/cardRoles";
import {
  buildCoachPrompt,
  coachErrorMessage,
  runCoach,
  validateCoach,
  type CoachCandidate,
  type CoachMode,
  COACH_MODEL,
  COACH_MODE_LABEL,
} from "@/lib/deckCoach";

export const maxDuration = 300;

const MAX_CANDIDATES = 160;

// POST { mode: "collection" | "budget" | "best", budget?: number, targetBracket?: number }
// Antwort: { summary, swaps: [{ out, in, reason, inOwned, inEur, outCardId }], cuts }
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Kein Anthropic-API-Key konfiguriert" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const mode: CoachMode = ["collection", "budget", "best"].includes(body?.mode) ? body.mode : "best";
  const budget = typeof body?.budget === "number" && body.budget > 0 ? body.budget : null;
  const targetBracket = [1, 2, 3, 4, 5].includes(body?.targetBracket) ? (body.targetBracket as number) : null;

  const { data: deck } = await supabase.from("decks").select("id").eq("id", params.id).eq("user_id", user.id).single();
  if (!deck) return Response.json({ error: "Deck nicht gefunden" }, { status: 404 });

  const { data: rows } = await supabase
    .from("deck_cards")
    .select("id, scryfall_id, name, type_line, cmc, is_commander")
    .eq("deck_id", params.id);
  const deckCards = rows ?? [];
  const commanderRows = deckCards.filter((r) => r.is_commander);
  if (!commanderRows.length) return Response.json({ error: "Deck hat keinen Commander" }, { status: 400 });

  // Commander-Daten (Kartentext, Identität) und Kandidatenlisten.
  const commanderCards = await fetchCardsCollection(commanderRows.map((r) => ({ id: r.scryfall_id as string })));
  const commanders = commanderRows.map((r) => commanderCards.get(r.scryfall_id as string)).filter((c) => c != null);
  if (!commanders.length) return Response.json({ error: "Commander bei Scryfall nicht gefunden" }, { status: 502 });
  const { themes, lists } = await loadCommanderLists(supabase, commanders);

  // Rollen der Deckkarten (Cache aus Phase 0).
  const deckNames = Array.from(new Set(deckCards.map((r) => r.name as string)));
  const { data: roleRows } = await supabase.from("card_roles").select("name, roles").in("name", deckNames.slice(0, 300));
  const roles = new Map((roleRows ?? []).map((r) => [r.name as string, r.roles as CardRole[]]));
  const counted = countRoles(
    deckCards.map((r) => ({ name: r.name as string, type_line: r.type_line as string | null, is_commander: r.is_commander as boolean })),
    roles
  );
  const roleSummary = [
    `Länder ${counted.lands.length}/${ROLE_TARGETS.lands!.target}`,
    ...(["ramp", "draw", "removal", "wipe"] as CardRole[]).map(
      (r) => `${ROLE_LABEL[r]} ${counted.byRole[r].length}/${ROLE_TARGETS[r]!.target}`
    ),
    `Karten gesamt ${deckCards.length}`,
  ].join(", ");

  // Kandidaten: alle Listenkarten, die nicht im Deck sind, mit Besitz.
  const byName = new Map<string, CoachCandidate>();
  for (const list of lists) {
    for (const c of list.cards) {
      if (deckNames.includes(c.name)) continue;
      const existing = byName.get(c.name);
      if (existing) existing.lists.push(list.label);
      else
        byName.set(c.name, {
          name: c.name,
          typeLine: c.typeLine,
          cmc: c.cmc,
          eur: c.eur,
          owned: 0,
          gameChanger: c.gameChanger,
          lists: [list.label],
        });
    }
  }
  const names = Array.from(byName.keys());
  for (let i = 0; i < names.length; i += 150) {
    const owned = await selectAll<{ name: string; quantity: number }>(() =>
      supabase.from("cards").select("name, quantity").eq("user_id", user.id).in("name", names.slice(i, i + 150)).order("id")
    );
    for (const o of owned) byName.get(o.name)!.owned += o.quantity;
  }

  let candidates = Array.from(byName.values()).filter((c) => {
    if (mode === "collection" && c.owned === 0) return false;
    if (mode === "budget" && c.owned === 0 && (c.eur ?? Infinity) > (budget ?? 0)) return false;
    if (targetBracket !== null && targetBracket <= 2 && c.gameChanger) return false;
    return true;
  });
  // Besessene und in mehreren Listen vorkommende Karten zuerst.
  candidates.sort((a, b) => Number(b.owned > 0) - Number(a.owned > 0) || b.lists.length - a.lists.length);
  candidates = candidates.slice(0, MAX_CANDIDATES);
  if (!candidates.length) {
    return Response.json({
      summary:
        mode === "collection"
          ? "In deiner Sammlung wurden keine passenden Karten für dieses Deck gefunden, die nicht schon drin sind."
          : "Keine passenden Kandidaten für die gewählten Filter.",
      swaps: [],
      cuts: [],
    });
  }

  const prompt = buildCoachPrompt({
    commander: commanders.map((c) => c.name).join(" + "),
    commanderText: commanders.map((c) => c.oracle_text ?? "").join("\n"),
    themes: themes.map((t) => t.name),
    deck: deckCards
      .filter((r) => !r.is_commander)
      .map((r) => ({
        name: r.name as string,
        typeLine: (r.type_line as string) ?? "",
        cmc: Number(r.cmc ?? 0),
        roles: roles.get(r.name as string) ?? null,
      })),
    roleSummary,
    candidates,
    mode,
    budget,
    targetBracket,
  });

  let raw;
  try {
    raw = await runCoach(prompt);
  } catch (err) {
    console.error("Deck-Coach fehlgeschlagen", err);
    return Response.json({ error: coachErrorMessage(err) }, { status: 502 });
  }
  if (!raw) return Response.json({ error: "Der Coach hat keine verwertbare Antwort geliefert." }, { status: 502 });

  const result = validateCoach(
    raw,
    deckNames,
    commanderRows.map((r) => r.name as string),
    candidates.map((c) => c.name)
  );

  // Ergebnis speichern – die Abfrage hat Geld gekostet und soll mit Datum
  // abrufbar bleiben (Tabelle ai_results, Migration 013).
  const saved = {
    summary: result.summary,
    swaps: result.swaps.map((s) => ({
      ...s,
      inOwned: (byName.get(s.in)?.owned ?? 0) > 0,
      inEur: byName.get(s.in)?.eur ?? null,
    })),
    cuts: result.cuts,
    applied: [] as string[],
  };
  const params_ = { mode, budget, targetBracket };
  const { data: row, error: saveError } = await supabase
    .from("ai_results")
    .insert({
      user_id: user.id,
      kind: "coach",
      deck_id: params.id,
      title: COACH_MODE_LABEL[mode],
      params: params_,
      result: saved,
      model: COACH_MODEL,
    })
    .select("id, created_at")
    .single();
  if (saveError) console.error("Coach-Ergebnis nicht gespeichert", saveError);

  return Response.json({
    id: row?.id ?? null,
    createdAt: row?.created_at ?? new Date().toISOString(),
    params: params_,
    result: saved,
  });
}

// GET: gespeicherte Coach-Abfragen dieses Decks (neueste zuerst).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const { data, error } = await supabase
    .from("ai_results")
    .select("id, created_at, params, result")
    .eq("user_id", user.id)
    .eq("kind", "coach")
    .eq("deck_id", params.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    history: (data ?? []).map((r) => ({ id: r.id, createdAt: r.created_at, params: r.params, result: r.result })),
  });
}
