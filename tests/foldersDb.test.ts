// Datenbank-Test der Ordner-Migration (014) auf echtem Postgres 17 (PGlite,
// läuft im Testprozess). Spielt das vollständige Schema ein und prüft
// Import, Eindeutigkeit, Verschieben, Trades und Ordner-Löschen.
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const S1 = "aaaaaaaa-0000-0000-0000-000000000001";
const S2 = "aaaaaaaa-0000-0000-0000-000000000002";

let db: PGlite;
const as = async (uid: string, sql: string, params: unknown[] = []) => {
  await db.exec(`set test.uid = '${uid}'`);
  return db.query<Record<string, unknown>>(sql, params);
};
const rows = async (uid: string) =>
  (
    await db.query<{ name: string; quantity: number; folder: string | null }>(
      `select c.name, c.quantity, f.name as folder from public.cards c
       left join public.folders f on f.id = c.folder_id
       where c.user_id = $1 order by c.name, f.name nulls first`,
      [uid],
    )
  ).rows.map((r) => `${r.quantity}× ${r.name} @ ${r.folder ?? "Unsortiert"}`);
const card = (sid: string, q: number) => ({ i: 0, scryfall_id: sid, name: sid === S1 ? "Sol Ring" : "Bolt", quantity: q, foil: false, colors: [] });

describe("Migration 014 – Ordner", () => {
  let f1 = "";
  let f2 = "";

  beforeAll(async () => {
    db = new PGlite();
    // Supabase-Teile nachbilden: Rollen, auth.users, auth.uid()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    `);
    const schema = readFileSync(join(__dirname, "..", "supabase", "schema.sql"), "utf8");
    // schema.sql enthält 014 bereits; Bestandsdaten im alten Zustand simulieren
    // wir deshalb, indem wir die Migration danach erneut einspielen (idempotent).
    await db.exec(schema);
    await db.exec(`insert into auth.users values ('${A}','a@x.de'),('${B}','b@x.de');
      insert into public.cards (user_id, scryfall_id, name, quantity, foil) values ('${A}','${S1}','Sol Ring',3,false);`);
    await db.exec(readFileSync(join(__dirname, "..", "supabase", "migrations", "014_folders.sql"), "utf8"));
    f1 = (await as(A, `insert into public.folders (user_id, name) values ($1, 'Trade-Binder') returning id`, [A])).rows[0].id as string;
    f2 = (await as(A, `insert into public.folders (user_id, name) values ($1, 'Kiste') returning id`, [A])).rows[0].id as string;
  }, 60_000);

  it("Ordnernamen je Nutzer eindeutig (Groß/Klein, Leerzeichen egal)", async () => {
    await expect(as(A, `insert into public.folders (user_id, name) values ($1, ' trade-binder ')`, [A])).rejects.toThrow();
  });

  it("Import in Ordner, Zusammenzählen im selben Ordner, alte Signatur → Unsortiert", async () => {
    let r = await as(A, `select public.import_cards_batch($1, $2::jsonb, true, $3::uuid) as res`, ["k1", JSON.stringify([card(S1, 2)]), f1]);
    expect((r.rows[0].res as { rows: { status: string }[] }).rows[0].status).toBe("imported");
    r = await as(A, `select public.import_cards_batch($1, $2::jsonb, true, $3::uuid) as res`, ["k2", JSON.stringify([card(S1, 1)]), f1]);
    expect((r.rows[0].res as { rows: { status: string }[] }).rows[0].status).toBe("updated");
    await as(A, `select public.import_cards_batch($1, $2::jsonb, true)`, ["k3", JSON.stringify([card(S2, 4)])]);
    r = await as(A, `select public.import_cards_batch($1, $2::jsonb, true, $3::uuid) as res`, ["k2", JSON.stringify([card(S1, 1)]), f1]);
    expect((r.rows[0].res as { replayed?: boolean }).replayed).toBe(true);
    expect(await rows(A)).toEqual(["4× Bolt @ Unsortiert", "3× Sol Ring @ Unsortiert", "3× Sol Ring @ Trade-Binder"]);
  });

  it("verhindert doppelte Zeilen in Unsortiert und fremde Ordner", async () => {
    await expect(
      db.query(`insert into public.cards (user_id, scryfall_id, name, quantity, foil) values ($1,$2,'X',1,false)`, [A, S1]),
    ).rejects.toThrow();
    await expect(as(B, `select public.import_cards_batch('kb', '[]'::jsonb, true, $1::uuid)`, [f1])).rejects.toThrow(/Ordner nicht gefunden/);
  });

  it("Verschieben legt gleiche Karten zusammen", async () => {
    const sol = (await db.query<{ id: string }>(`select id from public.cards where user_id=$1 and scryfall_id=$2 and folder_id is null`, [A, S1])).rows[0].id;
    const bolt = (await db.query<{ id: string }>(`select id from public.cards where user_id=$1 and scryfall_id=$2`, [A, S2])).rows[0].id;
    await as(A, `select public.move_cards($1::uuid[], $2::uuid)`, [[sol], f1]);
    await as(A, `select public.move_cards($1::uuid[], $2::uuid)`, [[bolt], f2]);
    expect(await rows(A)).toEqual(["4× Bolt @ Kiste", "6× Sol Ring @ Trade-Binder"]);
  });

  it("Trade nimmt beim Geber aus den Ordnern, Empfänger bekommt nach Unsortiert", async () => {
    const tid = (await db.query<{ id: string }>(`insert into public.trades (proposer_id, partner_id, status) values ($1,$2,'pending') returning id`, [A, B])).rows[0].id;
    await db.query(`insert into public.trade_items (trade_id, from_user_id, scryfall_id, name, quantity, foil) values ($1,$2,$3,'Sol Ring',5,false)`, [tid, A, S1]);
    await as(B, `select public.accept_trade($1)`, [tid]);
    expect(await rows(A)).toEqual(["4× Bolt @ Kiste", "1× Sol Ring @ Trade-Binder"]);
    expect(await rows(B)).toEqual(["5× Sol Ring @ Unsortiert"]);
  });

  it("Ordner löschen: Karten wandern nach Unsortiert und werden zusammengelegt", async () => {
    await db.query(`insert into public.cards (user_id, scryfall_id, name, quantity, foil) values ($1,$2,'Sol Ring',2,false)`, [A, S1]);
    await as(A, `select public.delete_folder($1)`, [f1]);
    expect(await rows(A)).toEqual(["4× Bolt @ Kiste", "3× Sol Ring @ Unsortiert"]);
    expect((await db.query<{ n: number }>(`select count(*)::int as n from public.folders where id=$1`, [f1])).rows[0].n).toBe(0);
  });

  it("Upsert mit Ordner-Schlüssel aktualisiert die Unsortiert-Zeile", async () => {
    const up = (q: number) =>
      db.query(
        `insert into public.cards (user_id, scryfall_id, name, quantity, foil, folder_id) values ($1,$2,'Bolt',$3,false,null)
         on conflict (user_id, scryfall_id, foil, folder_id) do update set quantity = excluded.quantity`,
        [B, S2, q],
      );
    await up(2);
    await up(7);
    const r = await db.query<{ n: number; q: number }>(`select count(*)::int n, max(quantity) q from public.cards where user_id=$1 and scryfall_id=$2`, [B, S2]);
    expect(r.rows[0]).toEqual({ n: 1, q: 7 });
  });
});
