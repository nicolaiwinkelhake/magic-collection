import { requireUser, unauthorized } from "@/lib/apiAuth";
import { commandersOf, loadMyDecks, loadRoles } from "@/lib/discoverData";
import { getCommander } from "@/lib/edhrec";
import { deckSynergy } from "@/lib/deckSynergy";
import { manaBase, nextSteps, overallScore } from "@/lib/deckPlan";
import { ROLE_TARGETS } from "@/lib/cardRoles";
import { deckHealth, healthLabel } from "@/lib/deckDoctor";

export const maxDuration = 60;

// Deck-Check – Übersicht aller eigenen Decks: Gesundheit gegen das
// Deckbau-Gerüst (Länder, Ramp, Kartenvorteil, Removal, Wipes, Kurve).
// Schnell: nutzt nur gecachte Kartenrollen; fehlende werden begrenzt
// nachgeladen.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const decks = await loadMyDecks(supabase, user.id);
  const names = decks.flatMap((d) => d.cards.map((c) => c.name));
  const roles = await loadRoles(supabase, names, 40);
  // Stimmigkeit nur aus schon gespeicherten EDHREC-Daten (keine neuen Abfragen)
  const pages = await Promise.all(decks.map((d) => getCommander(supabase, commandersOf(d), { cacheOnly: true }).catch(() => null)));
  const out = decks.map((d, i) => {
    const health = deckHealth(d.cards, roles);
    const page = pages[i];
    const synergy = page?.cards.length ? deckSynergy(d.cards, page.cards, []) : null;
    const overall = overallScore(health, synergy);
    return {
      id: d.id,
      name: d.name,
      commander: [d.commander_name, d.partner_name].filter(Boolean).join(" & "),
      image: d.commander_image_url,
      identity: d.color_identity,
      health,
      overall,
      steps: nextSteps({ health, mana: manaBase(d.cards, d.color_identity), synergy, swaps: 0, landTarget: ROLE_TARGETS.lands!.target }, 2).map((s) => s.title),
      label: healthLabel(overall),
    };
  });
  out.sort((a, b) => a.overall - b.overall);
  return Response.json({ decks: out });
}
