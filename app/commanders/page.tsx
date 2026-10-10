import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/supabase/selectAll";
import { CommanderSearch } from "@/components/CommanderSearch";

export const dynamic = "force-dynamic";

function commanderHref(name: string, partner?: string | null) {
  return `/commanders/${encodeURIComponent(name)}${partner ? `?partner=${encodeURIComponent(partner)}` : ""}`;
}

export default async function CommandersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: decks } = await supabase
    .from("decks")
    .select("id, name, commander_name, partner_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Legendäre Kreaturen (und Planeswalker mit "can be your commander") der Sammlung.
  const legends = await selectAll<{ name: string; type_line: string | null; oracle_text: string | null }>(() =>
    supabase
      .from("cards")
      .select("name, type_line, oracle_text")
      .eq("user_id", user.id)
      .ilike("type_line", "%Legendary%")
      .order("name")
      .order("id")
  );
  const deckCommanders = new Set((decks ?? []).map((d) => d.commander_name as string));
  const candidates = Array.from(
    new Set(
      legends
        .filter(
          (c) =>
            /Creature/.test(c.type_line ?? "") || /can be your commander/i.test(c.oracle_text ?? "")
        )
        .map((c) => c.name)
    )
  ).filter((n) => !deckCommanders.has(n));

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">👑 Commander</h1>
        <Link href="/collection" className="text-sm text-indigo-400 hover:underline">
          Zur Sammlung
        </Link>
      </header>

      <CommanderSearch />

      {(decks ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Commander deiner Decks</h2>
          <ul className="flex flex-wrap gap-2">
            {(decks ?? []).map((d) => (
              <li key={d.id as string}>
                <Link
                  href={commanderHref(d.commander_name as string, d.partner_name as string | null)}
                  className="block rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-600 px-3 py-2 text-sm"
                >
                  {d.commander_name as string}
                  {d.partner_name && ` + ${d.partner_name}`}
                  <span className="block text-xs text-zinc-500">{d.name as string}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {candidates.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Mögliche Commander aus deiner Sammlung ({candidates.length})</h2>
          <ul className="flex flex-wrap gap-2">
            {candidates.map((n) => (
              <li key={n}>
                <Link
                  href={commanderHref(n)}
                  className="block rounded-full bg-zinc-800 hover:bg-zinc-700 px-3 py-1 text-sm"
                >
                  {n}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
