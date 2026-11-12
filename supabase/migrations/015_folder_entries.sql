-- ============================================================
-- Migration 015 – Ordner wie Playlists (Mehrfach-Zuordnung)
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Bisher lag ein Sammlungseintrag in genau einem Ordner (cards.folder_id).
-- Jetzt kann jede Karte – aus der Sammlung UND von der Wunschliste – in
-- beliebig vielen Ordnern stehen. Der Bestand zählt weiterhin nur einmal.
--
-- Ablauf:
-- 1) Tabelle folder_entries (Ordner ↔ Sammlungs- oder Wunschlisteneintrag)
-- 2) bisherige Ordner-Zuordnungen übernehmen
-- 3) Exemplare derselben Karte, die auf mehrere Ordner verteilt waren,
--    wieder zu einer Zeile zusammenlegen (Mengen addiert, alle Ordner
--    bleiben zugeordnet)
-- 4) Import, Ordner löschen und Trades auf das neue Modell umstellen
--
-- cards.folder_id wird nicht mehr benutzt und mit Migration 016 entfernt
-- (erst nach dem Deploy der neuen App-Version ausführen).
-- ============================================================

create table if not exists public.folder_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  wishlist_id uuid references public.wishlist(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint folder_entries_one_target check (num_nonnulls(card_id, wishlist_id) = 1),
  constraint folder_entries_card_key unique (folder_id, card_id),
  constraint folder_entries_wish_key unique (folder_id, wishlist_id)
);

create index if not exists folder_entries_user_idx on public.folder_entries (user_id);
create index if not exists folder_entries_card_idx on public.folder_entries (card_id);
create index if not exists folder_entries_wish_idx on public.folder_entries (wishlist_id);

alter table public.folder_entries enable row level security;

drop policy if exists "Eigene Ordnereinträge sehen" on public.folder_entries;
create policy "Eigene Ordnereinträge sehen" on public.folder_entries
  for select using (auth.uid() = user_id);
drop policy if exists "Eigene Ordnereinträge anlegen" on public.folder_entries;
create policy "Eigene Ordnereinträge anlegen" on public.folder_entries
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.folders f where f.id = folder_id and f.user_id = auth.uid())
    and (card_id is null or exists (select 1 from public.cards c where c.id = card_id and c.user_id = auth.uid()))
    and (wishlist_id is null or exists (select 1 from public.wishlist w where w.id = wishlist_id and w.user_id = auth.uid()))
  );
drop policy if exists "Eigene Ordnereinträge löschen" on public.folder_entries;
create policy "Eigene Ordnereinträge löschen" on public.folder_entries
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Bestehende Zuordnungen übernehmen und verteilte Exemplare zusammenlegen
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'cards' and column_name = 'folder_id') then
    insert into public.folder_entries (user_id, folder_id, card_id)
      select user_id, folder_id, id from public.cards where folder_id is not null
      on conflict do nothing;

    -- je Karte (Druck + Foil) bleibt die älteste Zeile, bevorzugt die ohne Ordner
    create temp table _card_merge as
      select id,
             first_value(id) over w as keeper,
             sum(quantity) over (partition by user_id, scryfall_id, foil) as total
        from public.cards
        window w as (partition by user_id, scryfall_id, foil
                     order by (folder_id is not null), created_at, id);

    insert into public.folder_entries (user_id, folder_id, card_id)
      select fe.user_id, fe.folder_id, m.keeper
        from public.folder_entries fe
        join _card_merge m on m.id = fe.card_id
       where m.id <> m.keeper
      on conflict do nothing;

    update public.cards c set quantity = m.total
      from _card_merge m
     where c.id = m.id and m.id = m.keeper and c.quantity <> m.total;

    delete from public.cards c using _card_merge m
     where c.id = m.id and m.id <> m.keeper;

    drop table _card_merge;

    execute 'update public.cards set folder_id = null where folder_id is not null';
  end if;
end $$;

-- wieder: je Nutzer, Druck und Foil genau eine Zeile
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_user_id_scryfall_id_foil_key') then
    alter table public.cards
      add constraint cards_user_id_scryfall_id_foil_key unique (user_id, scryfall_id, foil);
  end if;
end $$;

-- ------------------------------------------------------------
-- Karten zu einem Ordner hinzufügen / daraus entfernen (Sammlung und
-- Wunschliste gemischt möglich). Liefert die Anzahl geänderter Einträge.
-- ------------------------------------------------------------
create or replace function public.folder_add(p_folder_id uuid, p_card_ids uuid[], p_wishlist_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  n1 int := 0;
  n2 int := 0;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not exists (select 1 from public.folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Ordner nicht gefunden';
  end if;
  insert into public.folder_entries (user_id, folder_id, card_id)
    select v_user, p_folder_id, c.id from public.cards c
     where c.id = any(coalesce(p_card_ids, '{}')) and c.user_id = v_user
    on conflict do nothing;
  get diagnostics n1 = row_count;
  insert into public.folder_entries (user_id, folder_id, wishlist_id)
    select v_user, p_folder_id, w.id from public.wishlist w
     where w.id = any(coalesce(p_wishlist_ids, '{}')) and w.user_id = v_user
    on conflict do nothing;
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;
revoke all on function public.folder_add(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.folder_add(uuid, uuid[], uuid[]) to authenticated;

create or replace function public.folder_remove(p_folder_id uuid, p_card_ids uuid[], p_wishlist_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  n int := 0;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  delete from public.folder_entries
   where user_id = v_user
     and folder_id = p_folder_id
     and (card_id = any(coalesce(p_card_ids, '{}')) or wishlist_id = any(coalesce(p_wishlist_ids, '{}')));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.folder_remove(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.folder_remove(uuid, uuid[], uuid[]) to authenticated;

-- Ordner löschen: nur der Ordner und seine Zuordnungen verschwinden – die
-- Karten bleiben in Sammlung bzw. Wunschliste.
create or replace function public.delete_folder(p_folder_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  n int := 0;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not exists (select 1 from public.folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Ordner nicht gefunden';
  end if;
  select count(*) into n from public.folder_entries where folder_id = p_folder_id;
  delete from public.folders where id = p_folder_id and user_id = v_user;
  return n;
end;
$$;
revoke all on function public.delete_folder(uuid) from public, anon;
grant execute on function public.delete_folder(uuid) to authenticated;

-- ------------------------------------------------------------
-- Import: Karten wie gewohnt buchen (eine Zeile je Druck + Foil) und – mit
-- Zielordner – dem Ordner zuordnen. Auch übersprungene, schon vorhandene
-- Karten kommen in den Ordner.
-- ------------------------------------------------------------
create or replace function public.import_cards_batch(
  p_batch_key text,
  p_rows jsonb,
  p_allow_duplicates boolean,
  p_folder_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_previous jsonb;
  v_row jsonb;
  v_existing_id uuid;
  v_status text;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  if p_folder_id is not null
     and not exists (select 1 from public.folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Ordner nicht gefunden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_batch_key, 0));

  select result into v_previous
    from public.import_batches
    where user_id = v_user and batch_key = p_batch_key;
  if found then
    return v_previous || jsonb_build_object('replayed', true);
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    select id into v_existing_id
      from public.cards
      where user_id = v_user
        and scryfall_id = (v_row->>'scryfall_id')::uuid
        and foil = (v_row->>'foil')::boolean
      for update;

    if v_existing_id is null then
      insert into public.cards (
        user_id, scryfall_id, name, name_de, set_code, collector_number, image_url,
        mana_cost, cmc, type_line, colors, rarity, oracle_text,
        quantity, foil, price_eur, price_eur_foil, price_updated_at
      ) values (
        v_user,
        (v_row->>'scryfall_id')::uuid,
        v_row->>'name',
        v_row->>'name_de',
        v_row->>'set_code',
        v_row->>'collector_number',
        v_row->>'image_url',
        v_row->>'mana_cost',
        coalesce((v_row->>'cmc')::numeric, 0),
        v_row->>'type_line',
        coalesce(array(select jsonb_array_elements_text(v_row->'colors')), '{}'),
        v_row->>'rarity',
        v_row->>'oracle_text',
        greatest(1, (v_row->>'quantity')::int),
        (v_row->>'foil')::boolean,
        (v_row->>'price_eur')::numeric,
        (v_row->>'price_eur_foil')::numeric,
        v_now
      )
      returning id into v_existing_id;
      v_status := 'imported';
    elsif p_allow_duplicates then
      update public.cards
        set quantity = quantity + greatest(1, (v_row->>'quantity')::int),
            price_eur = (v_row->>'price_eur')::numeric,
            price_eur_foil = (v_row->>'price_eur_foil')::numeric,
            price_updated_at = v_now,
            name_de = coalesce(name_de, v_row->>'name_de')
        where id = v_existing_id;
      v_status := 'updated';
    else
      v_status := 'skipped';
    end if;

    if p_folder_id is not null then
      insert into public.folder_entries (user_id, folder_id, card_id)
        values (v_user, p_folder_id, v_existing_id)
        on conflict do nothing;
    end if;

    if v_status <> 'skipped' then
      insert into public.card_price_history (scryfall_id, captured_on, price_eur, price_eur_foil)
      values ((v_row->>'scryfall_id')::uuid, current_date,
              (v_row->>'price_eur')::numeric, (v_row->>'price_eur_foil')::numeric)
      on conflict (scryfall_id, captured_on)
      do update set price_eur = excluded.price_eur,
                    price_eur_foil = excluded.price_eur_foil;
    end if;

    v_results := v_results || jsonb_build_object('i', v_row->'i', 'status', v_status);
    v_existing_id := null;
  end loop;

  v_result := jsonb_build_object('rows', v_results, 'created_at', v_now);
  insert into public.import_batches (user_id, batch_key, result)
  values (v_user, p_batch_key, v_result);

  perform public.snapshot_collection_value();

  return v_result;
end;
$$;
revoke all on function public.import_cards_batch(text, jsonb, boolean, uuid) from public, anon;
grant execute on function public.import_cards_batch(text, jsonb, boolean, uuid) to authenticated;

-- ------------------------------------------------------------
-- Trades: wieder eine Zeile je Karte; der Empfänger bekommt die Karte
-- ohne Ordner (er sortiert selbst).
-- ------------------------------------------------------------
create or replace function public.accept_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trades;
  it public.trade_items;
  giver public.cards;
  src public.cards;
  receiver uuid;
  owned int;
  remaining int;
  take int;
begin
  select * into t from public.trades where id = p_trade_id;
  if t.id is null then raise exception 'Trade nicht gefunden'; end if;
  if t.partner_id <> auth.uid() then
    raise exception 'Nur der Handelspartner kann den Trade annehmen';
  end if;
  if t.status <> 'pending' then
    raise exception 'Dieser Trade ist nicht mehr offen';
  end if;

  for it in select * from public.trade_items where trade_id = p_trade_id loop
    select coalesce(sum(quantity), 0) into owned
      from public.cards
      where user_id = it.from_user_id
        and scryfall_id = it.scryfall_id
        and foil = it.foil;
    if owned < it.quantity then
      raise exception 'Nicht genügend Exemplare von "%" im Bestand', it.name;
    end if;
  end loop;

  for it in select * from public.trade_items where trade_id = p_trade_id loop
    receiver := case when it.from_user_id = t.proposer_id
                     then t.partner_id else t.proposer_id end;

    select * into giver
      from public.cards
      where user_id = it.from_user_id
        and scryfall_id = it.scryfall_id
        and foil = it.foil
      limit 1;

    remaining := it.quantity;
    for src in
      select * from public.cards
        where user_id = it.from_user_id
          and scryfall_id = it.scryfall_id
          and foil = it.foil
        order by created_at
        for update
    loop
      exit when remaining <= 0;
      take := least(remaining, src.quantity);
      if take >= src.quantity then
        delete from public.cards where id = src.id;
      else
        update public.cards set quantity = quantity - take where id = src.id;
      end if;
      remaining := remaining - take;
    end loop;

    update public.cards
      set quantity = quantity + it.quantity
      where user_id = receiver
        and scryfall_id = it.scryfall_id
        and foil = it.foil;

    if not found then
      insert into public.cards (
        user_id, scryfall_id, name, set_code, collector_number, image_url,
        mana_cost, cmc, type_line, colors, rarity, oracle_text,
        quantity, foil, price_eur, price_eur_foil, price_updated_at
      )
      values (
        receiver, it.scryfall_id, it.name, giver.set_code, giver.collector_number,
        coalesce(giver.image_url, it.image_url), giver.mana_cost, giver.cmc,
        giver.type_line, giver.colors, giver.rarity, giver.oracle_text,
        it.quantity, it.foil, giver.price_eur, giver.price_eur_foil, now()
      );
    end if;
  end loop;

  update public.trades
    set status = 'accepted', resolved_at = now()
    where id = p_trade_id;
end;
$$;
