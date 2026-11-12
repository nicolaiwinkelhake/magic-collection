import { createClient } from "@/lib/supabase/server";
import { entriesToCsv } from "@/lib/csv";
import { selectAll } from "@/lib/supabase/selectAll";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  // Seitenweise laden: sonst enthielt der Export max. 1000 Einträge.
  type FolderRef = { name: string } | { name: string }[] | null;
  type Row = Omit<Parameters<typeof entriesToCsv>[0][number], "folder"> & {
    folder_entries: { folders: FolderRef }[] | null;
  };
  const rows = await selectAll<Row>(() =>
    supabase
      .from("cards")
      .select("name, quantity, foil, set_code, price_eur, price_eur_foil, condition, language, folder_entries(folders(name))")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .order("id")
  );

  // Ordner als eigene Spalte (mehrere mit "; " getrennt)
  const names = (entries: Row["folder_entries"]) =>
    (entries ?? [])
      .flatMap((e) => (Array.isArray(e.folders) ? e.folders : e.folders ? [e.folders] : []))
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b, "de"))
      .join("; ");
  const csv = entriesToCsv(rows.map(({ folder_entries, ...c }) => ({ ...c, folder: names(folder_entries) })));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="magic-collection.csv"`,
    },
  });
}
