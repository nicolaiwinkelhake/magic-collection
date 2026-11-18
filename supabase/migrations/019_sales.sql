-- ============================================================
-- Migration 019 – Extern verkaufen (Cardmarket / Kleinanzeigen)
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- 1) Ordner können Unterordner haben (parent_id) und einem Verkaufskanal
--    gehören (channel). Für Kleinanzeigen ist ein Unterordner = eine Anzeige,
--    mit eigenem Anzeigenpreis (asking_price).
-- 2) Ordnereinträge bekommen einen selbst festgelegten Verkaufspreis je
--    Exemplar und optional eine Verkaufsmenge (Rest bleibt in der Sammlung).
-- 3) Verkaufshistorie (sales) und sell_entries(): bucht verkaufte Karten
--    aus der Sammlung aus – ganz oder einzeln.
-- ============================================================

-- 1) Unterordner + Kanal
alter table public.folders
  add column if not exists parent_id uuid references public.folders(id) on delete cascade,
  add column if not exists channel text,
  add column if not exists asking_price numeric(10, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'folders_channel_check') then
    alter table public.folders
      add constraint folders_channel_check check (channel is null or channel in ('cardmarket', 'kleinanzeigen'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'folders_asking_price_check') then
    alter table public.folders
      add constraint folders_asking_price_check check (asking_price is null or asking_price >= 0);
  end if;
end $$;

create index if not exists folders_parent_idx on public.folders (parent_id);

-- Namen eindeutig je Ebene (zwei Anzeigen dürfen nicht gleich heißen,
-- ein Unterordner darf aber wie ein normaler Ordner heißen)
drop index if exists public.folders_user_name_idx;
create unique index if not exists folders_user_parent_name_idx on public.folders
  (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

-- Unterordner nur unter eigenen Ordnern
drop policy if exists "Eigene Ordner anlegen" on public.folders;
create policy "Eigene Ordner anlegen" on public.folders for insert with check (
  auth.uid() = user_id
  and (parent_id is null or exists (select 1 from public.folders p where p.id = parent_id and p.user_id = auth.uid()))
);
drop policy if exists "Eigene Ordner umbenennen" on public.folders;
create policy "Eigene Ordner umbenennen" on public.folders for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and (parent_id is null or exists (select 1 from public.folders p where p.id = parent_id and p.user_id = auth.uid()))
);

-- 2) Preis + Menge je Eintrag
alter table public.folder_entries
  add column if not exists asking_price numeric(10, 2),
  add column if not exists sell_quantity integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'folder_entries_asking_price_check') then
    alter table public.folder_entries
      add constraint folder_entries_asking_price_check check (asking_price is null or asking_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'folder_entries_sell_quantity_check') then
    alter table public.folder_entries
      add constraint folder_entries_sell_quantity_check check (sell_quantity is null or sell_quantity > 0);
  end if;
end $$;

drop policy if exists "Eigene Ordnereinträge ändern" on public.folder_entries;
create policy "Eigene Ordnereinträge ändern" on public.folder_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Verkaufshistorie
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  channel text not null check (channel in ('cardmarket', 'kleinanzeigen')),
  listing text,                 -- Anzeige / Ordnername
  scryfall_id uuid,
  name text not null,
  set_code text,
  collector_number text,
  foil boolean not null default false,
  condition text,
  language text,
  quantity integer not null check (quantity > 0),
  price_eur numeric(10, 2),     -- Erlös je Exemplar
  sold_at timestamptz not null default now()
);

create index if not exists sales_user_idx on public.sales (user_id, sold_at desc);
alter table public.sales enable row level security;

drop policy if exists "Eigene Verkäufe sehen" on public.sales;
create policy "Eigene Verkäufe sehen" on public.sales for select using (auth.uid() = user_id);
drop policy if exists "Eigene Verkäufe löschen" on public.sales;
create policy "Eigene Verkäufe löschen" on public.sales for delete using (auth.uid() = user_id);
-- Kein Insert-Policy: Schreiben nur über sell_entries()

-- Verkaufte Einträge ausbuchen. p_items: [{ "entry_id": uuid, "quantity": int, "price": numeric|null }]
-- Menge wird auf den Bestand begrenzt. Ist danach nichts mehr übrig, wird
-- der Sammlungseintrag gelöscht (seine Ordnerzuordnungen fallen mit weg),
-- sonst wird die Menge verringert; die angebotene Menge (sell_quantity)
-- sinkt mit, bei "alle" (null) bleibt der Rest im Verkauf.
create or replace function public.sell_entries(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_entry record;
  v_qty integer;
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select e.id as entry_id, e.folder_id, e.sell_quantity, c.id as card_id, c.quantity as owned,
           c.scryfall_id, c.name, c.set_code, c.collector_number, c.foil, c.condition, c.language,
           f.name as folder_name, coalesce(f.channel, pf.channel) as channel, pf.name as parent_name
      into v_entry
      from public.folder_entries e
      join public.cards c on c.id = e.card_id
      join public.folders f on f.id = e.folder_id
      left join public.folders pf on pf.id = f.parent_id
     where e.id = (v_item->>'entry_id')::uuid
       and e.user_id = v_user and c.user_id = v_user
     for update of c;
    if not found or v_entry.channel is null then
      continue;
    end if;

    v_qty := least(greatest(coalesce((v_item->>'quantity')::integer, 1), 1), v_entry.owned);

    insert into public.sales (user_id, channel, listing, scryfall_id, name, set_code, collector_number,
                              foil, condition, language, quantity, price_eur)
    values (v_user, v_entry.channel,
            case when v_entry.parent_name is not null then v_entry.folder_name else null end,
            v_entry.scryfall_id, v_entry.name, v_entry.set_code, v_entry.collector_number,
            v_entry.foil, v_entry.condition, v_entry.language, v_qty,
            nullif(v_item->>'price', '')::numeric);

    if v_qty >= v_entry.owned then
      delete from public.cards where id = v_entry.card_id and user_id = v_user;
    else
      update public.cards set quantity = quantity - v_qty where id = v_entry.card_id and user_id = v_user;
      -- Rest bleibt im Verkauf, wenn noch welche angeboten sind
      if v_entry.sell_quantity is not null and v_entry.sell_quantity <= v_qty then
        delete from public.folder_entries where id = v_entry.entry_id and user_id = v_user;
      elsif v_entry.sell_quantity is not null then
        update public.folder_entries set sell_quantity = sell_quantity - v_qty where id = v_entry.entry_id and user_id = v_user;
      end if;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.sell_entries(jsonb) from public, anon;
grant execute on function public.sell_entries(jsonb) to authenticated;
