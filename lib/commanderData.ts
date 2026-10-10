import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScryfallCard } from "@/lib/scryfall";
import { cachedSearch, type CompactCard } from "@/lib/scryfallCache";
import { getCommanderThemes, type CommanderTheme } from "@/lib/commanderProfile";
import { buildListSpecs, cleanList } from "@/lib/commanderLists";
import { unionIdentity } from "@/lib/colorIdentity";

// Themen + Kartenlisten für einen Commander (+ Partner). Gemeinsam genutzt
// von der Commander-Seite und dem Deck-Coach.
export type CommanderLists = {
  identity: string[];
  themes: CommanderTheme[];
  lists: Array<{ key: string; label: string; description?: string; cards: CompactCard[] }>;
};

export async function loadCommanderLists(
  supabase: SupabaseClient,
  commanders: ScryfallCard[]
): Promise<CommanderLists> {
  const names = commanders.map((c) => c.name);
  const identity = unionIdentity(commanders.map((c) => c.color_identity ?? c.colors ?? []));

  // Themen (einmalig per Claude, danach aus der DB).
  const themes = await getCommanderThemes(supabase, {
    name: names.join(" + "),
    typeLine: commanders.map((c) => c.type_line).join(" / "),
    oracleText: commanders.map((c) => `${c.name}: ${c.oracle_text ?? ""}`).join("\n\n"),
    colorIdentity: identity,
  });

  // Nacheinander wegen Scryfall-Rate-Limit; meist aus dem Cache.
  const lists: CommanderLists["lists"] = [];
  for (const spec of buildListSpecs(identity, themes)) {
    const cards = await cachedSearch(supabase, spec.query, { order: spec.order, limit: spec.limit, ttlDays: spec.ttlDays });
    lists.push({ key: spec.key, label: spec.label, description: spec.description, cards: cleanList(cards, names) });
  }
  return { identity, themes, lists };
}
