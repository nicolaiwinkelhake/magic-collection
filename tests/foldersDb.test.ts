// Datenbank-Test der Ordner-Migrationen (014 → 015 → 016) auf echtem
// Postgres 17 (PGlite, läuft im Testprozess). Spielt das vollständige Schema
// ein, stellt den Stand nach 014 mit verteilten Exemplaren nach und prüft die
// Umstellung auf Mehrfach-Ordner (Sammlung + Wunschliste).
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const S1 = "aaaaaaaa-0000-0000-0000-000000000001";
const S2 = "aaaaaaaa-0000-0000-0000-000000000002";
const S3 = "aaaaaaaa-0000-0000-0000-000000000003";

const migration = (name: string) => readFileSync(join(__dirname, "..", "supabase", "migrations", name), "utf8");

let db: PGlite;
const as = async (uid: string, sql: string, params: unknown[] = []) => {
  await db.exec(`set test.uid = '${uid}'`);
  return db.query<Record<string, unknown>>(sql, params);
};
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<Record<string, T>>(sql, params)).rows[0];
// "3× Sol Ring [Binder, Kiste]" je Sammlungszeile
const cards = async (uid: string) =>
  (
    await db.query<{ name: string; quantity: number; folders: string | null }>(
      `select c.name, c.quantity,
              (select string_agg(f.name, ', ' order by f.name) from public.folder_entries fe
                 join public.folders f on f.id = fe.folder_id where fe.card_id = c.id) as folders
         from public.cards c where c.user_id = $1 order by c.name`,
      [uid],
    )
  ).rows.map((r) => `${r.quantity}× ${r.name} [${r.folders ?? ""}]`);
const wishes = async (uid: string) =>
  (
    await db.query<{ name: string; folders: string | null }>(
      `select w.name,
              (select string_agg(f.name, ', ' order by f.name) from public.folder_entries fe
                 join public.folders f on f.id = fe.folder_id where fe.wishlist_id = w.id) as folders
         from public.wishlist w where w.user_id = $1 order by w.name`,
      [uid],
    )
  ).rows.map((r) => `${r.name} [${r.folders ?? ""}]`);
const card = (sid: string, q: number) => ({ i: 0, scryfall_id: sid, name: sid === S1 ? "Sol Ring" : sid === S2 ? "Bolt" : "Opt", quantity: q, foil: false, colors: [] });
const cardId = async (uid: string, sid: string) => (await one<string>(`select id from public.cards where user_id=$1 and scryfall_id=$2`, [uid, sid])).id;

describe("Ordner-Migrationen 015/016 – Mehrfach-Zuordnung", () => {
  let binder = "";
  let kiste = "";
  let atraxa = "";
  let wishOpt = "";

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
    await db.exec(readFileSync(join(__dirname, "..", "supabase", "schema.sql"), "utf8"));
    // Stand nach 014 nachstellen (Spalte folder_id, Exemplare auf Ordner verteilt)
    await db.exec(migration("014_folders.sql"));
    await db.exec(`insert into auth.users values ('${A}','a@x.de'),('${B}','b@x.de')`);
    binder = (await one<string>(`insert into public.folders (user_id, name) values ($1, 'Binder') returning id`, [A])).id;
    kiste = (await one<string>(`insert into public.folders (user_id, name) values ($1, 'Kiste') returning id`, [A])).id;
    await db.query(
      `insert into public.cards (user_id, scryfall_id, name, quantity, foil, folder_id, created_at) values
         ($1,$2,'Sol Ring',3,false,null, now() - interval '2 days'),
         ($1,$2,'Sol Ring',2,false,$4, now() - interval '1 day'),
         ($1,$3,'Bolt',4,false,$5, now())`,
      [A, S1, S2, binder, kiste],
    );
    await db.exec(migration("015_folder_entries.sql"));
  }, 60_000);

  it("015 legt verteilte Exemplare zusammen und behält alle Ordner", async () => {
    expect(await cards(A)).toEqual(["4× Bolt [Kiste]", "5× Sol Ring [Binder]"]);
    // wieder eine Zeile je Druck + Foil
    await expect(
      db.query(`insert into public.cards (user_id, scryfall_id, name, quantity, foil) values ($1,$2,'X',1,false)`, [A, S1]),
    ).rejects.toThrow();
  });

  it("015 ist wiederholbar, 016 entfernt die alte Spalte", async () => {
    await db.exec(migration("015_folder_entries.sql"));
    await db.exec(migration("016_drop_card_folder_id.sql"));
    await db.exec(migration("016_drop_card_folder_id.sql"));
    expect(await cards(A)).toEqual(["4× Bolt [Kiste]", "5× Sol Ring [Binder]"]);
    const col = await one<number>(
      `select count(*)::int as n from information_schema.columns where table_name='cards' and column_name='folder_id'`,
    );
    expect(col.n).toBe(0);
  });

  it("eine Karte kann in mehreren Ordnern stehen – Sammlung und Wunschliste gemischt", async () => {
    atraxa = (await one<string>(`insert into public.folders (user_id, name) values ($1, 'Atraxa') returning id`, [A])).id;
    wishOpt = (await one<string>(`insert into public.wishlist (user_id, scryfall_id, name) values ($1,$2,'Opt') returning id`, [A, S3])).id;
    const sol = await cardId(A, S1);
    let r = await as(A, `select public.folder_add($1, $2::uuid[], $3::uuid[]) as n`, [atraxa, [sol], [wishOpt]]);
    expect(r.rows[0].n).toBe(2);
    // doppelt hinzufügen ändert nichts
    r = await as(A, `select public.folder_add($1, $2::uuid[], $3::uuid[]) as n`, [atraxa, [sol], [wishOpt]]);
    expect(r.rows[0].n).toBe(0);
    await as(A, `select public.folder_add($1, $2::uuid[], null)`, [kiste, [sol]]);
    expect(await cards(A)).toEqual(["4× Bolt [Kiste]", "5× Sol Ring [Atraxa, Binder, Kiste]"]);
    expect(await wishes(A)).toEqual(["Opt [Atraxa]"]);
  });

  it("fremde Ordner und fremde Karten sind tabu", async () => {
    const sol = await cardId(A, S1);
    await expect(as(B, `select public.folder_add($1, $2::uuid[], null)`, [binder, [sol]])).rejects.toThrow(/Ordner nicht gefunden/);
    const own = (await one<string>(`insert into public.folders (user_id, name) values ($1, 'Meins') returning id`, [B])).id;
    const r = await as(B, `select public.folder_add($1, $2::uuid[], $3::uuid[]) as n`, [own, [sol], [wishOpt]]);
    expect(r.rows[0].n).toBe(0);
    const removed = await as(B, `select public.folder_remove($1, $2::uuid[], null) as n`, [binder, [sol]]);
    expect(removed.rows[0].n).toBe(0);
  });

  it("Import in einen Ordner ordnet auch schon vorhandene Karten zu", async () => {
    // Sol Ring ist schon da (übersprungen), Opt ist neu
    const r = await as(A, `select public.import_cards_batch($1, $2::jsonb, false, $3::uuid) as res`, [
      "k1",
      JSON.stringify([card(S1, 1), { ...card(S3, 2), i: 1 }]),
      binder,
    ]);
    expect((r.rows[0].res as { rows: { status: string }[] }).rows.map((x) => x.status)).toEqual(["skipped", "imported"]);
    // mit Zusammenzählen + alte Signatur ohne Ordner
    await as(A, `select public.import_cards_batch($1, $2::jsonb, true)`, ["k2", JSON.stringify([card(S2, 1)])]);
    expect(await cards(A)).toEqual(["5× Bolt [Kiste]", "2× Opt [Binder]", "5× Sol Ring [Atraxa, Binder, Kiste]"]);
  });

  it("Entfernen aus einem Ordner lässt die Karte in den anderen", async () => {
    const sol = await cardId(A, S1);
    const r = await as(A, `select public.folder_remove($1, $2::uuid[], $3::uuid[]) as n`, [atraxa, [sol], [wishOpt]]);
    expect(r.rows[0].n).toBe(2);
    expect(await cards(A)).toEqual(["5× Bolt [Kiste]", "2× Opt [Binder]", "5× Sol Ring [Binder, Kiste]"]);
    expect(await wishes(A)).toEqual(["Opt []"]);
  });

  it("Ordner löschen behält die Karten, gelöschte Karten verschwinden aus den Ordnern", async () => {
    await as(A, `select public.delete_folder($1)`, [kiste]);
    expect(await cards(A)).toEqual(["5× Bolt []", "2× Opt [Binder]", "5× Sol Ring [Binder]"]);
    await as(A, `select public.folder_add($1, null, $2::uuid[])`, [binder, [wishOpt]]);
    await db.query(`delete from public.wishlist where id = $1`, [wishOpt]);
    await db.query(`delete from public.cards where user_id = $1 and scryfall_id = $2`, [A, S3]);
    const left = await one<number>(`select count(*)::int as n from public.folder_entries where folder_id = $1`, [binder]);
    expect(left.n).toBe(1);
  });

  it("Trade: Geber gibt ab, Empfänger bekommt die Karte ohne Ordner", async () => {
    const tid = (await one<string>(`insert into public.trades (proposer_id, partner_id, status) values ($1,$2,'pending') returning id`, [A, B])).id;
    await db.query(`insert into public.trade_items (trade_id, from_user_id, scryfall_id, name, quantity, foil) values ($1,$2,$3,'Sol Ring',2,false)`, [tid, A, S1]);
    await as(B, `select public.accept_trade($1)`, [tid]);
    expect(await cards(A)).toEqual(["5× Bolt []", "3× Sol Ring [Binder]"]);
    expect(await cards(B)).toEqual(["2× Sol Ring []"]);
  });
});
