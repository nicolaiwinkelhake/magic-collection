import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchGermanNames, NAMES_PER_QUERY } from "@/lib/germanNames";

export const maxDuration = 60;

// Pro Aufruf begrenzt, damit die Anfrage kurz bleibt; der Client ruft so
// lange erneut auf, bis `remaining` 0 ist.
const NAMES_PER_CALL = NAMES_PER_QUERY * 10;

// Füllt name_de für Bestandskarten ohne deutschen Namen nach.
// Antwort: { updated, remaining }
export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { data: rows, error } = await supabase
    .from("cards")
    .select("name")
    .eq("user_id", user.id)
    .is("name_de", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const pending = Array.from(new Set((rows ?? []).map((r) => r.name as string)));
  if (!pending.length) return Response.json({ updated: 0, remaining: 0 });

  const names = pending.slice(0, NAMES_PER_CALL);
  const german = await fetchGermanNames(names);

  let updated = 0;
  for (const [name, de] of german) {
    const { error: updateError } = await supabase
      .from("cards")
      .update({ name_de: de })
      .eq("user_id", user.id)
      .eq("name", name)
      .is("name_de", null);
    if (!updateError) updated += 1;
  }

  // Namen ohne Ergebnis (Scryfall nicht erreichbar) zählen weiter als offen;
  // der Client hört auf, sobald ein Aufruf nichts mehr schafft (updated = 0).
  return Response.json({ updated, remaining: pending.length - updated });
}
