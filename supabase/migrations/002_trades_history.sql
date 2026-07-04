-- ============================================================
-- Migration 002 – Trades, Wertverlauf, Bestandsbereinigung
-- Für bestehende Installationen, die Schema v1 bereits ausgeführt haben.
-- Im Supabase SQL-Editor ausführen. Idempotent, wo möglich.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Bestand bereinigen: Duplikate (gleicher Druck + Foil-Status)
--    zu einer Zeile zusammenführen und Mengen summieren.
--    Danach Unique-Constraint, damit künftig sauber per Upsert
--    zusammengeführt wird (Grundlage für korrekte Trades & Werte).
-- ------------------------------------------------------------
update public.cards c
set quantity = agg.total
from (
  select user_id, scryfall_id, foil,
         sum(quantity) as total,
         min(created_at) as first_created
  from public.cards
  group by user_id, scryfall_id, foil
) agg
where c.user_id = agg.user_id
  and c.scryfall_id = agg.scryfall_id
  and c.foil = agg.foil
  and c.created_at = agg.first_created;

delete from public.cards c
using (
  select user_id, scryfall_id, foil, min(created_at) as first_created
  from public.cards
  group by user_id, scryfall_id, foil
) keep
where c.user_id = keep.user_id
  and c.scryfall_id = keep.scryfall_id
  and c.foil = keep.foil
  and c.created_at <> keep.first_created;

alter table public.cards
  drop constraint if exists cards_unique_printing;
alter table public.cards
  add constraint cards_unique_printing unique (user_id, scryfall_id, foil);

-- ------------------------------------------------------------
-- 2) Preisverlauf je Karte (global, pro Scryfall-ID und Tag).
--    Geteilt über alle Nutzer – Preise sind öffentliche Daten und
--    hängen nur an der Karte, nicht am Besitzer. So entsteht kein
--    redundanter Verlauf pro Nutzer.
-- ------------------------------------------------------------
create table if not exists public.card_price_history (
  scryfall_id uuid not null,
  captured_on date not null default current_date,
  price_eur numeric,
  price_eur_foil numeric,
  primary key (scryfall_id, captured_on)
);

alter table public.card_price_history enable row level security;

drop policy if exists "Preisverlauf für eingeloggte lesbar" on public.card_price_history;
create policy "Preisverlauf für eingeloggte lesbar"
  on public.card_price_history for select
  to authenticated using (true);
-- Kein Insert-Policy: Schreiben ausschließlich über record_card_price().

-- ------------------------------------------------------------
-- 3) Wertverlauf der Gesamtsammlung je Nutzer (Tages-Snapshot).
--    Der Gesamtwert hängt davon ab, was jemand zu diesem Zeitpunkt
--    besaß – daher als eigener Snapshot pro Nutzer und Tag.
-- ------------------------------------------------------------
create table if not exists public.collection_value_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  captured_on date not null default current_date,
  total_value_eur numeric not null default 0,
  primary key (user_id, captured_on)
);

alter table public.collection_value_history enable row level security;

drop policy if exists "Eigenen Wertverlauf lesen" on public.collection_value_history;
create policy "Eigenen Wertverlauf lesen"
  on public.collection_value_history for select
  using (auth.uid() = user_id);

-- Preis einer Karte in den Verlauf schreiben (Upsert pro Tag).
create or replace function public.record_card_price(
  p_scryfall_id uuid,
  p_eur numeric,
  p_eur_foil numeric
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.card_price_history (scryfall_id, captured_on, price_eur, price_eur_foil)
  values (p_scryfall_id, current_date, p_eur, p_eur_foil)
  on conflict (scryfall_id, captured_on)
  do update set price_eur = excluded.price_eur,
                price_eur_foil = excluded.price_eur_foil;
$$;

-- Aktuellen Gesamtwert der eigenen Sammlung als Tages-Snapshot festhalten.
create or replace function public.snapshot_collection_value()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric;
begin
  select coalesce(sum(
           case when foil then coalesce(price_eur_foil, price_eur, 0)
                else coalesce(price_eur, 0) end * quantity
         ), 0)
    into total
    from public.cards
    where user_id = auth.uid();

  insert into public.collection_value_history (user_id, captured_on, total_value_eur)
  values (auth.uid(), current_date, total)
  on conflict (user_id, captured_on)
  do update set total_value_eur = excluded.total_value_eur;

  return total;
end;
$$;

-- Preisverlauf einer bestimmten Karte abrufen (für Einzelkarten-Chart).
create or replace function public.card_value_history(p_scryfall_id uuid)
returns table (captured_on date, price_eur numeric, price_eur_foil numeric)
language sql
security definer
set search_path = public
as $$
  select captured_on, price_eur, price_eur_foil
  from public.card_price_history
  where scryfall_id = p_scryfall_id
  order by captured_on;
$$;

-- ------------------------------------------------------------
-- 4) Trades zwischen Freunden inkl. Historie
-- ------------------------------------------------------------
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending', -- pending | accepted | declined | cancelled
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists trades_proposer_idx on public.trades (proposer_id);
create index if not exists trades_partner_idx on public.trades (partner_id);

alter table public.trades enable row level security;

drop policy if exists "Beteiligte sehen Trades" on public.trades;
create policy "Beteiligte sehen Trades"
  on public.trades for select
  using (auth.uid() = proposer_id or auth.uid() = partner_id);

drop policy if exists "Vorschlagende legen Trades an" on public.trades;
create policy "Vorschlagende legen Trades an"
  on public.trades for insert
  with check (auth.uid() = proposer_id);
-- Statuswechsel laufen ausschließlich über die Funktionen unten,
-- daher bewusst keine Update-Policy (verhindert "accepted" ohne Transfer).

create table if not exists public.trade_items (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  scryfall_id uuid not null,
  name text not null,
  image_url text,
  foil boolean not null default false,
  quantity int not null default 1,
  price_eur_at_trade numeric
);

create index if not exists trade_items_trade_idx on public.trade_items (trade_id);

alter table public.trade_items enable row level security;

drop policy if exists "Beteiligte sehen Trade-Positionen" on public.trade_items;
create policy "Beteiligte sehen Trade-Positionen"
  on public.trade_items for select
  using (
    exists (
      select 1 from public.trades t
      where t.id = trade_id
        and (t.proposer_id = auth.uid() or t.partner_id = auth.uid())
    )
  );

drop policy if exists "Vorschlagender fügt Positionen hinzu" on public.trade_items;
create policy "Vorschlagender fügt Positionen hinzu"
  on public.trade_items for insert
  with check (
    exists (
      select 1 from public.trades t
      where t.id = trade_id
        and t.proposer_id = auth.uid()
        and t.status = 'pending'
    )
  );

-- Trade annehmen: prüft Berechtigung + Bestand und transferiert die
-- Karten atomar zwischen den Sammlungen. SECURITY DEFINER, weil dabei
-- bewusst die Sammlungen BEIDER Beteiligten verändert werden – die
-- Prüfungen am Anfang stellen sicher, dass nur der Partner annehmen kann
-- und keine Karten "aus dem Nichts" entstehen.
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
  receiver uuid;
  owned int;
begin
  select * into t from public.trades where id = p_trade_id;
  if t.id is null then raise exception 'Trade nicht gefunden'; end if;
  if t.partner_id <> auth.uid() then
    raise exception 'Nur der Handelspartner kann den Trade annehmen';
  end if;
  if t.status <> 'pending' then
    raise exception 'Dieser Trade ist nicht mehr offen';
  end if;

  -- Vorab prüfen: besitzt jede gebende Seite genug Karten?
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

  -- Transfer durchführen
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

    -- Geber reduzieren / leere Zeilen entfernen
    update public.cards
      set quantity = quantity - it.quantity
      where user_id = it.from_user_id
        and scryfall_id = it.scryfall_id
        and foil = it.foil;
    delete from public.cards
      where user_id = it.from_user_id
        and scryfall_id = it.scryfall_id
        and foil = it.foil
        and quantity <= 0;

    -- Empfänger erhöhen oder neu anlegen
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

-- Trade ablehnen (nur Partner) bzw. zurückziehen (nur Vorschlagender).
create or replace function public.decline_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trades;
begin
  select * into t from public.trades where id = p_trade_id;
  if t.id is null then raise exception 'Trade nicht gefunden'; end if;
  if t.status <> 'pending' then raise exception 'Trade ist nicht mehr offen'; end if;

  if auth.uid() = t.partner_id then
    update public.trades set status = 'declined', resolved_at = now() where id = p_trade_id;
  elsif auth.uid() = t.proposer_id then
    update public.trades set status = 'cancelled', resolved_at = now() where id = p_trade_id;
  else
    raise exception 'Keine Berechtigung für diesen Trade';
  end if;
end;
$$;

-- Eigene Trades inkl. Partner-E-Mail und Positionen (als JSON) abrufen.
create or replace function public.my_trades()
returns table (
  id uuid,
  status text,
  note text,
  created_at timestamptz,
  resolved_at timestamptz,
  proposer_id uuid,
  partner_id uuid,
  proposer_email text,
  partner_email text,
  i_am_proposer boolean,
  items jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.status, t.note, t.created_at, t.resolved_at,
    t.proposer_id, t.partner_id,
    pu.email, au.email,
    (t.proposer_id = auth.uid()) as i_am_proposer,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', ti.name,
        'image_url', ti.image_url,
        'foil', ti.foil,
        'quantity', ti.quantity,
        'price', ti.price_eur_at_trade,
        'from_user_id', ti.from_user_id
      ) order by ti.name)
      from public.trade_items ti where ti.trade_id = t.id
    ), '[]'::jsonb) as items
  from public.trades t
  join auth.users pu on pu.id = t.proposer_id
  join auth.users au on au.id = t.partner_id
  where t.proposer_id = auth.uid() or t.partner_id = auth.uid()
  order by t.created_at desc;
$$;
