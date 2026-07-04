-- ============================================================
-- Magic Collection – Datenbank-Schema für Supabase
-- Im Supabase Dashboard unter "SQL Editor" einfach einfügen & ausführen.
-- ============================================================

-- Tabelle: Karten pro Nutzer
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scryfall_id uuid not null,
  name text not null,
  set_code text,
  collector_number text,
  image_url text,
  mana_cost text,
  cmc numeric,
  type_line text,
  colors text[],
  rarity text,
  oracle_text text,
  quantity int not null default 1,
  foil boolean not null default false,
  price_eur numeric,
  price_eur_foil numeric,
  price_updated_at timestamptz,
  condition text not null default 'NM',
  language text not null default 'EN',
  created_at timestamptz not null default now(),
  unique (user_id, scryfall_id, foil)
);

-- Index für schnelle Filterung pro Nutzer
create index if not exists cards_user_id_idx on public.cards (user_id);
create index if not exists cards_name_idx on public.cards (name);
create index if not exists cards_colors_idx on public.cards using gin (colors);

-- Row Level Security aktivieren – KEIN Nutzer kommt ohne das hier an fremde Karten
alter table public.cards enable row level security;

-- Policy: Nutzer sehen nur ihre eigenen Karten
create policy "Nutzer sehen eigene Karten"
  on public.cards for select
  using (auth.uid() = user_id);

-- Policy: Nutzer können nur eigene Karten anlegen
create policy "Nutzer fügen eigene Karten hinzu"
  on public.cards for insert
  with check (auth.uid() = user_id);

-- Policy: Nutzer können nur eigene Karten bearbeiten
create policy "Nutzer bearbeiten eigene Karten"
  on public.cards for update
  using (auth.uid() = user_id);

-- Policy: Nutzer können nur eigene Karten löschen
create policy "Nutzer löschen eigene Karten"
  on public.cards for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Freundschaften
-- ============================================================
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending', -- 'pending' | 'accepted'
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

alter table public.friendships enable row level security;

create policy "Nutzer sehen eigene Freundschaftseinträge"
  on public.friendships for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Nutzer senden Anfragen"
  on public.friendships for insert
  with check (auth.uid() = user_id);

create policy "Nutzer aktualisieren betreffende Anfragen"
  on public.friendships for update
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Nutzer löschen betreffende Anfragen"
  on public.friendships for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- ============================================================
-- Commander Decks
-- ============================================================
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  commander_name text not null,
  commander_image_url text,
  color_identity text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.decks enable row level security;

create policy "Nutzer sehen eigene Decks"
  on public.decks for select
  using (auth.uid() = user_id);

create policy "Nutzer legen eigene Decks an"
  on public.decks for insert
  with check (auth.uid() = user_id);

create policy "Nutzer bearbeiten eigene Decks"
  on public.decks for update
  using (auth.uid() = user_id);

create policy "Nutzer löschen eigene Decks"
  on public.decks for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Karten innerhalb eines Decks
-- ============================================================
create table if not exists public.deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scryfall_id uuid not null,
  name text not null,
  image_url text,
  mana_cost text,
  cmc numeric,
  type_line text,
  colors text[],
  oracle_text text,
  is_commander boolean not null default false,
  price_eur numeric,
  price_eur_foil numeric,
  created_at timestamptz not null default now()
);

create index if not exists deck_cards_deck_id_idx on public.deck_cards (deck_id);

alter table public.deck_cards enable row level security;

create policy "Nutzer sehen eigene Deckkarten"
  on public.deck_cards for select
  using (auth.uid() = user_id);

create policy "Nutzer fügen eigene Deckkarten hinzu"
  on public.deck_cards for insert
  with check (auth.uid() = user_id);

create policy "Nutzer löschen eigene Deckkarten"
  on public.deck_cards for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Funktion: Welche bestätigten Freunde besitzen eine bestimmte Karte?
-- security definer = läuft mit erhöhten Rechten, gibt aber bewusst NUR
-- Besitzer-ID, E-Mail und Anzahl zurück – niemals die komplette fremde
-- Sammlung. Eingeschränkt auf Freunde mit Status 'accepted'.
-- ============================================================
create or replace function public.friends_owning_card(card_name text)
returns table (friend_id uuid, friend_email text, quantity int)
language sql
security definer
set search_path = public
as $$
  select c.user_id as friend_id, u.email as friend_email, sum(c.quantity)::int as quantity
  from public.cards c
  join auth.users u on u.id = c.user_id
  where c.name = card_name
    and c.user_id <> auth.uid()
    and c.user_id in (
      select friend_id from public.friendships
        where user_id = auth.uid() and status = 'accepted'
      union
      select user_id from public.friendships
        where friend_id = auth.uid() and status = 'accepted'
    )
  group by c.user_id, u.email;
$$;

-- Funktion: Nutzer per E-Mail finden, um Freundschaftsanfrage zu senden
-- Gibt bewusst nur id zurück, keine weiteren Profildaten.
create or replace function public.find_user_by_email(search_email text)
returns table (id uuid)
language sql
security definer
set search_path = public
as $$
  select id from auth.users where email = search_email limit 1;
$$;

-- Funktion: eigene Freundschaftseinträge inkl. E-Mail der Gegenseite.
-- Gibt nur Personen zurück, mit denen bereits eine friendships-Zeile
-- besteht (gesendet, erhalten oder bestätigt) – kein offener Nutzer-Scan.
create or replace function public.my_friendships()
returns table (
  id uuid,
  status text,
  direction text,
  other_user_id uuid,
  other_user_email text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    f.id,
    f.status,
    case when f.user_id = auth.uid() then 'outgoing' else 'incoming' end as direction,
    case when f.user_id = auth.uid() then f.friend_id else f.user_id end as other_user_id,
    u.email as other_user_email,
    f.created_at
  from public.friendships f
  join auth.users u
    on u.id = (case when f.user_id = auth.uid() then f.friend_id else f.user_id end)
  where f.user_id = auth.uid() or f.friend_id = auth.uid();
$$;
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



-- ------------------------------------------------------------
-- 1) Wunschliste: Karten, die ein Nutzer sucht.
-- ------------------------------------------------------------
create table if not exists public.wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scryfall_id uuid not null,
  name text not null,
  image_url text,
  price_eur numeric,
  created_at timestamptz not null default now(),
  unique (user_id, scryfall_id)
);

create index if not exists wishlist_user_idx on public.wishlist (user_id);
create index if not exists wishlist_name_idx on public.wishlist (name);

alter table public.wishlist enable row level security;

drop policy if exists "Eigene Wunschliste sehen" on public.wishlist;
create policy "Eigene Wunschliste sehen"
  on public.wishlist for select using (auth.uid() = user_id);
drop policy if exists "Eigene Wunschliste pflegen (insert)" on public.wishlist;
create policy "Eigene Wunschliste pflegen (insert)"
  on public.wishlist for insert with check (auth.uid() = user_id);
drop policy if exists "Eigene Wunschliste pflegen (delete)" on public.wishlist;
create policy "Eigene Wunschliste pflegen (delete)"
  on public.wishlist for delete using (auth.uid() = user_id);

-- Welche bestätigten Freunde SUCHEN eine bestimmte Karte?
-- Spiegelbild zu friends_owning_card – so weißt du, wem du mit einer
-- Karte aus deiner Sammlung helfen könntest.
create or replace function public.friends_wanting_card(card_name text)
returns table (friend_id uuid, friend_email text)
language sql
security definer
set search_path = public
as $$
  select w.user_id, u.email
  from public.wishlist w
  join auth.users u on u.id = w.user_id
  where w.name = card_name
    and w.user_id <> auth.uid()
    and w.user_id in (
      select friend_id from public.friendships
        where user_id = auth.uid() and status = 'accepted'
      union
      select user_id from public.friendships
        where friend_id = auth.uid() and status = 'accepted'
    );
$$;

-- ------------------------------------------------------------
-- 2) Sammlungs-Freigabe (read-only) an einzelne Freunde.
-- ------------------------------------------------------------
create table if not exists public.collection_shares (
  owner_id uuid not null references auth.users(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id)
);

alter table public.collection_shares enable row level security;

drop policy if exists "Freigaben: Besitzer und Betrachter sehen" on public.collection_shares;
create policy "Freigaben: Besitzer und Betrachter sehen"
  on public.collection_shares for select
  using (auth.uid() = owner_id or auth.uid() = viewer_id);
drop policy if exists "Freigabe anlegen (nur Besitzer)" on public.collection_shares;
create policy "Freigabe anlegen (nur Besitzer)"
  on public.collection_shares for insert
  with check (auth.uid() = owner_id);
drop policy if exists "Freigabe entfernen (nur Besitzer)" on public.collection_shares;
create policy "Freigabe entfernen (nur Besitzer)"
  on public.collection_shares for delete
  using (auth.uid() = owner_id);

-- Wer hat MIR seine Sammlung freigegeben?
create or replace function public.collections_shared_with_me()
returns table (owner_id uuid, owner_email text)
language sql
security definer
set search_path = public
as $$
  select s.owner_id, u.email
  from public.collection_shares s
  join auth.users u on u.id = s.owner_id
  where s.viewer_id = auth.uid();
$$;

-- Freigegebene Sammlung eines Besitzers lesen – nur wenn eine Freigabe
-- an den aufrufenden Nutzer existiert. Gibt read-only Kartendaten zurück.
create or replace function public.shared_collection(p_owner uuid)
returns setof public.cards
language sql
security definer
set search_path = public
as $$
  select c.*
  from public.cards c
  where c.user_id = p_owner
    and exists (
      select 1 from public.collection_shares s
      where s.owner_id = p_owner and s.viewer_id = auth.uid()
    );
$$;

-- ------------------------------------------------------------
-- 3) Leih-Tracking: verliehene Karten festhalten.
-- ------------------------------------------------------------
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references auth.users(id) on delete cascade,
  borrower_id uuid references auth.users(id) on delete set null,
  borrower_name text,
  card_name text not null,
  scryfall_id uuid,
  quantity int not null default 1,
  status text not null default 'out', -- 'out' | 'returned'
  note text,
  created_at timestamptz not null default now(),
  returned_at timestamptz
);

create index if not exists loans_lender_idx on public.loans (lender_id);

alter table public.loans enable row level security;

drop policy if exists "Leihen: Verleiher und Entleiher sehen" on public.loans;
create policy "Leihen: Verleiher und Entleiher sehen"
  on public.loans for select
  using (auth.uid() = lender_id or auth.uid() = borrower_id);
drop policy if exists "Leihe anlegen (nur Verleiher)" on public.loans;
create policy "Leihe anlegen (nur Verleiher)"
  on public.loans for insert with check (auth.uid() = lender_id);
drop policy if exists "Leihe ändern (nur Verleiher)" on public.loans;
create policy "Leihe ändern (nur Verleiher)"
  on public.loans for update using (auth.uid() = lender_id);
drop policy if exists "Leihe löschen (nur Verleiher)" on public.loans;
create policy "Leihe löschen (nur Verleiher)"
  on public.loans for delete using (auth.uid() = lender_id);

-- Eigene Leihen inkl. Entleiher-E-Mail (falls registrierter Nutzer).
create or replace function public.my_loans()
returns table (
  id uuid, card_name text, quantity int, status text, note text,
  created_at timestamptz, returned_at timestamptz,
  borrower_name text, borrower_email text
)
language sql
security definer
set search_path = public
as $$
  select l.id, l.card_name, l.quantity, l.status, l.note,
         l.created_at, l.returned_at, l.borrower_name, u.email
  from public.loans l
  left join auth.users u on u.id = l.borrower_id
  where l.lender_id = auth.uid()
  order by (l.status = 'returned'), l.created_at desc;
$$;

-- ------------------------------------------------------------
-- 4) Deck-Wertverlauf (Tages-Snapshot je Deck).
-- ------------------------------------------------------------
create table if not exists public.deck_value_history (
  deck_id uuid not null references public.decks(id) on delete cascade,
  captured_on date not null default current_date,
  total_value_eur numeric not null default 0,
  primary key (deck_id, captured_on)
);

alter table public.deck_value_history enable row level security;

drop policy if exists "Deckwertverlauf: nur eigene Decks" on public.deck_value_history;
create policy "Deckwertverlauf: nur eigene Decks"
  on public.deck_value_history for select
  using (
    exists (select 1 from public.decks d
            where d.id = deck_id and d.user_id = auth.uid())
  );

create or replace function public.snapshot_deck_value(p_deck_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare total numeric;
begin
  if not exists (select 1 from public.decks where id = p_deck_id and user_id = auth.uid()) then
    raise exception 'Deck nicht gefunden';
  end if;

  select coalesce(sum(coalesce(price_eur,0)),0) into total
    from public.deck_cards where deck_id = p_deck_id;

  insert into public.deck_value_history (deck_id, captured_on, total_value_eur)
  values (p_deck_id, current_date, total)
  on conflict (deck_id, captured_on)
  do update set total_value_eur = excluded.total_value_eur;

  return total;
end;
$$;
