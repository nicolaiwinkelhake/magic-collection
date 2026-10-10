// Supabase/PostgREST liefert pro Abfrage höchstens 1000 Zeilen ("max rows").
// Ohne Blättern fehlten bei großen Sammlungen stillschweigend Karten – in der
// Sammlungsansicht, im Export, in Statistiken und Decks.
//
// Verwendung (Abfrage inkl. Filter + eindeutiger Sortierung als Fabrik):
//   const cards = await selectAll<Card>(() =>
//     supabase.from("cards").select("*").order("name").order("id"));

export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };
type RangeQuery<T> = { range(from: number, to: number): PromiseLike<PageResult<T>> };

export async function selectAll<T>(makeQuery: () => RangeQuery<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
