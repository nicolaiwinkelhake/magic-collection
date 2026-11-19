import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/supabase/selectAll";
import { CommanderSearch } from "@/components/CommanderSearch";
import { PageHeader } from "@/components/ui/PageHeader";
import { CommanderRanking, type RankedCommander } from "@/components/CommanderRanking";
import { getTopCommanders, rankIndex } from "@/lib/edhrecTop";
import { catalogByNames } from "@/lib/catalogLookup";

export const dynamic = "force-dynamic";

// So viele EDHREC-Seiten (je 100) werden für die Rangliste geladen – reicht,
// um auch weniger bekannte eigene Commander einzuordnen.
const TOP_PAGES = 15;

export default async function CommandersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: decks }, legends, top] = await Promise.all([
    supabase.from("decks").select("id, name, commander_name, partner_name").eq("user_id", user.id).order("created_at", { ascending: false }),
    // Legendäre Kreaturen (und Planeswalker mit "can be your commander") der Sammlung
    selectAll<{ name: string; type_line: string | null; oracle_text: string | null }>(() =>
      supabase.from("cards").select("name, type_line, oracle_text").eq("user_id", user.id).ilike("type_line", "%Legendary%").order("name").order("id"),
    ),
    getTopCommanders(supabase, TOP_PAGES).catch(() => []),
  ]);

  const deckByCommander = new Map<string, string>();
  for (const d of decks ?? []) {
    for (const n of [d.commander_name, d.partner_name]) if (n) deckByCommander.set(String(n).toLowerCase(), String(d.name));
  }
  const ownedNames = Array.from(
    new Set(
      legends.filter((c) => /Creature/.test(c.type_line ?? "") || /can be your commander/i.test(c.oracle_text ?? "")).map((c) => c.name),
    ),
  );
  const owned = new Set(ownedNames.map((n) => n.toLowerCase()));
  for (const d of decks ?? []) for (const n of [d.commander_name, d.partner_name]) if (n && !owned.has(String(n).toLowerCase())) ownedNames.push(String(n));
  ownedNames.forEach((n) => owned.add(n.toLowerCase()));

  // Bild + Farbidentität aus dem eigenen Katalog
  const top100 = top.slice(0, 100);
  const lookupNames = Array.from(new Set([...top100.flatMap((t) => [t.name, ...t.name.split(" // ")]), ...ownedNames]));
  const cards = await catalogByNames(lookupNames).catch(() => new Map());
  const info = (name: string) => {
    const c = cards.get(name.toLowerCase()) ?? cards.get(name.split(" // ")[0].toLowerCase());
    const parts = name.includes(" // ") ? name.split(" // ").map((p) => cards.get(p.toLowerCase())) : [];
    const identity = new Set<string>([...(c?.color_identity ?? []), ...parts.flatMap((p) => p?.color_identity ?? [])]);
    // "A // B", das keine doppelseitige Karte ist → Partner-Paar
    const pair = name.includes(" // ") && !cards.has(name.toLowerCase());
    // Bild: aus dem Katalog, sonst direkt von Scryfall (Bild per Name)
    const image = c?.image_uris?.normal ?? `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(name.split(" // ")[0])}`;
    return { image, colors: Array.from(identity), pair };
  };

  const ranks = rankIndex(top);
  const isOwned = (name: string) => name.split(" // ").every((p) => owned.has(p.trim().toLowerCase())) || owned.has(name.toLowerCase());
  const deckOf = (name: string) => deckByCommander.get(name.toLowerCase()) ?? deckByCommander.get(name.split(" // ")[0].toLowerCase()) ?? null;

  const mine: RankedCommander[] = ownedNames
    .map((n) => {
      // doppelseitige Karten führt EDHREC teils nur unter der Vorderseite
      const t = ranks.get(n.toLowerCase()) ?? ranks.get(n.split(" // ")[0].toLowerCase());
      return { name: n, rank: t?.rank ?? null, decks: t?.decks ?? null, owned: true, deck: deckOf(n), ...info(n) };
    })
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name));

  const best: RankedCommander[] = top100.map((t) => ({ name: t.name, rank: t.rank, decks: t.decks, owned: isOwned(t.name), deck: deckOf(t.name), ...info(t.name) }));

  return (
    <main className="page max-w-5xl">
      <PageHeader title="Commander" subtitle="Beliebteste Commander der letzten 2 Jahre (EDHREC) – und deine" />
      <details className="surface group">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium flex items-center justify-between">
          Commander suchen
          <span className="text-zinc-500 group-open:rotate-180 transition" aria-hidden>▾</span>
        </summary>
        <div className="px-1 pb-1">
          <CommanderSearch />
        </div>
      </details>
      <CommanderRanking mine={mine} top={best} rankedUpTo={top.length} />
    </main>
  );
}
