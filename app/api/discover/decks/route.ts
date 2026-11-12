import { requireUser, unauthorized } from "@/lib/apiAuth";
import { loadMyDecks, loadRoles } from "@/lib/discoverData";
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
  const out = decks.map((d) => {
    const health = deckHealth(d.cards, roles);
    return {
      id: d.id,
      name: d.name,
      commander: [d.commander_name, d.partner_name].filter(Boolean).join(" & "),
      image: d.commander_image_url,
      identity: d.color_identity,
      health,
      label: healthLabel(health.score),
    };
  });
  out.sort((a, b) => a.health.score - b.health.score);
  return Response.json({ decks: out });
}
