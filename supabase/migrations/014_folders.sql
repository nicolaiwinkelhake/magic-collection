-- ============================================================
-- Migration 014 – Ordner in der Sammlung
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Jeder Nutzer legt eigene Ordner an (keine Vorgaben). Ein Sammlungs-
-- eintrag liegt in genau einem Ordner oder in keinem ("Unsortiert",
-- folder_id = null). Exemplare einer Karte dürfen sich auf mehrere Ordner
-- verteilen: eindeutig ist jetzt (Nutzer, Druck, Foil, Ordner).
--
-- Alle Stellen, die Karten anlegen/umbuchen (Import, Trades, Verschieben,
-- Ordner löschen), legen gleiche Karten im selben Ordner zusammen statt
-- doppelte Zeilen zu erzeugen.
-- ============================================================

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

-- Ordnernamen je Nutzer eindeutig (ohne Groß/Klein)
create unique index if not exists folders_user_name_idx on public.folders (user_id, lower(btrim(name)));

alter table public.folders enable row level security;

drop policy if exists "Eigene Ordner sehen" on public.folders;
create policy "Eigene Ordner sehen" on public.folders for select using (auth.uid() = user_id);
drop policy if exists "Eigene Ordner anlegen" on public.folders;
create policy "Eigene Ordner anlegen" on public.folders for insert with check (auth.uid() = user_id);
drop policy if exists "Eigene Ordner umbenennen" on public.folders;
create policy "Eigene Ordner umbenennen" on public.folders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Eigene Ordner löschen" on public.folders;
create policy "Eigene Ordner löschen" on public.folders for delete using (auth.uid() = user_id);

alter table public.cards
  add column if not exists folder_id uuid references public.folders(id) on delete set null;
create index if not exists cards_folder_idx on public.cards (folder_id);

-- Eindeutigkeit inkl. Ordner; "kein Ordner" zählt als ein Wert (NULLS NOT DISTINCT)
alter table public.cards drop constraint if exists cards_user_id_scryfall_id_foil_key;
alter table public.cards drop constraint if exists cards_unique_printing;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_unique_printing_folder') then
    alter table public.cards
      add constraint cards_unique_printing_folder unique nulls not distinct (user_id, scryfall_id, foil, folder_id);
  end if;
end $$;

-- ------------------------------------------------------------
-- Import in einen Ordner (null = Unsortiert)
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
        and folder_id is not distinct from p_folder_id
      for update;

    if v_existing_id is null then
      insert into public.cards (
        user_id, scryfall_id, name, name_de, set_code, collector_number, image_url,
        mana_cost, cmc, type_line, colors, rarity, oracle_text,
        quantity, foil, price_eur, price_eur_foil, price_updated_at, folder_id
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
        v_now,
        p_folder_id
      );
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

-- Alte Signatur (ohne Ordner) bleibt nutzbar und importiert nach "Unsortiert"
create or replace function public.import_cards_batch(
  p_batch_key text,
  p_rows jsonb,
  p_allow_duplicates boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.import_cards_batch(p_batch_key, p_rows, p_allow_duplicates, null::uuid);
$$;
revoke all on function public.import_cards_batch(text, jsonb, boolean) from public, anon;
grant execute on function public.import_cards_batch(text, jsonb, boolean) to authenticated;

-- ------------------------------------------------------------
-- Karten in einen Ordner verschieben (null = Unsortiert). Liegt dieselbe
-- Karte (Druck + Foil) dort schon, werden die Mengen zusammengelegt.
-- Liefert die Anzahl verschobener Einträge.
-- ------------------------------------------------------------
create or replace function public.move_cards(p_ids uuid[], p_folder_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  r public.cards;
  v_target uuid;
  v_moved int := 0;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  if p_folder_id is not null
     and not exists (select 1 from public.folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Ordner nicht gefunden';
  end if;

  for r in
    select * from public.cards
      where id = any(p_ids) and user_id = v_user
      order by id
      for update
  loop
    continue when r.folder_id is not distinct from p_folder_id;

    select id into v_target
      from public.cards
      where user_id = v_user
        and scryfall_id = r.scryfall_id
        and foil = r.foil
        and folder_id is not distinct from p_folder_id
      for update;

    if v_target is not null then
      update public.cards set quantity = quantity + r.quantity where id = v_target;
      delete from public.cards where id = r.id;
    else
      update public.cards set folder_id = p_folder_id where id = r.id;
    end if;
    v_moved := v_moved + 1;
    v_target := null;
  end loop;

  return v_moved;
end;
$$;
revoke all on function public.move_cards(uuid[], uuid) from public, anon;
grant execute on function public.move_cards(uuid[], uuid) to authenticated;

-- ------------------------------------------------------------
-- Ordner löschen: Karten wandern nach "Unsortiert" (zusammengelegt),
-- dann wird der Ordner entfernt. Karten gehen dabei nie verloren.
-- ------------------------------------------------------------
create or replace function public.delete_folder(p_folder_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_moved int;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  if not exists (select 1 from public.folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Ordner nicht gefunden';
  end if;
  select coalesce(array_agg(id), '{}') into v_ids
    from public.cards where user_id = v_user and folder_id = p_folder_id;
  v_moved := public.move_cards(v_ids, null);
  delete from public.folders where id = p_folder_id and user_id = v_user;
  return v_moved;
end;
$$;
revoke all on function public.delete_folder(uuid) from public, anon;
grant execute on function public.delete_folder(uuid) to authenticated;

-- ------------------------------------------------------------
-- Trades: Exemplare können jetzt auf mehrere Ordner verteilt sein. Der
-- Geber gibt zuerst aus "Unsortiert", dann aus den Ordnern ab; der
-- Empfänger bekommt die Karten nach "Unsortiert".
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

  -- Vorab prüfen: besitzt jede gebende Seite genug Karten (über alle Ordner)?
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

    -- Metadaten der Karte vom Geber übernehmen (für vollständige Empfängerzeile)
    select * into giver
      from public.cards
      where user_id = it.from_user_id
        and scryfall_id = it.scryfall_id
        and foil = it.foil
      limit 1;

    -- Geber reduzieren: zuerst "Unsortiert", dann Ordner; leere Zeilen löschen
    remaining := it.quantity;
    for src in
      select * from public.cards
        where user_id = it.from_user_id
          and scryfall_id = it.scryfall_id
          and foil = it.foil
        order by (folder_id is not null), created_at
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

    -- Empfänger: in "Unsortiert" erhöhen oder neu anlegen
    update public.cards
      set quantity = quantity + it.quantity
      where user_id = receiver
        and scryfall_id = it.scryfall_id
        and foil = it.foil
        and folder_id is null;

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
