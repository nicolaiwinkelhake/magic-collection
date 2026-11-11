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
  type Row = Omit<Parameters<typeof entriesToCsv>[0][number], "folder"> & { folders: FolderRef };
  const rows = await selectAll<Row>(() =>
    supabase
      .from("cards")
      .select("name, quantity, foil, set_code, price_eur, price_eur_foil, condition, language, folders(name)")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .order("id")
  );

  // Ordnername als eigene Spalte, damit die Sortierung erhalten bleibt
  const folderName = (f: FolderRef) => (Array.isArray(f) ? f[0]?.name : f?.name) ?? "";
  const csv = entriesToCsv(rows.map(({ folders, ...c }) => ({ ...c, folder: folderName(folders) })));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="magic-collection.csv"`,
    },
  });
}
