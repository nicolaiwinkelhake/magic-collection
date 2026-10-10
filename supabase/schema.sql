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

-- ------------------------------------------------------------
-- 5) RPCs nur für eingeloggte Nutzer (siehe Migration 006).
-- ------------------------------------------------------------
revoke execute on function public.accept_trade(uuid) from public, anon;
grant execute on function public.accept_trade(uuid) to authenticated;

revoke execute on function public.card_value_history(uuid) from public, anon;
grant execute on function public.card_value_history(uuid) to authenticated;

revoke execute on function public.collections_shared_with_me() from public, anon;
grant execute on function public.collections_shared_with_me() to authenticated;

revoke execute on function public.decline_trade(uuid) from public, anon;
grant execute on function public.decline_trade(uuid) to authenticated;

revoke execute on function public.find_user_by_email(text) from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;

revoke execute on function public.friends_owning_card(text) from public, anon;
grant execute on function public.friends_owning_card(text) to authenticated;

revoke execute on function public.friends_wanting_card(text) from public, anon;
grant execute on function public.friends_wanting_card(text) to authenticated;

revoke execute on function public.my_friendships() from public, anon;
grant execute on function public.my_friendships() to authenticated;

revoke execute on function public.my_loans() from public, anon;
grant execute on function public.my_loans() to authenticated;

revoke execute on function public.my_trades() from public, anon;
grant execute on function public.my_trades() to authenticated;

revoke execute on function public.record_card_price(uuid, numeric, numeric) from public, anon;
grant execute on function public.record_card_price(uuid, numeric, numeric) to authenticated;

revoke execute on function public.shared_collection(uuid) from public, anon;
grant execute on function public.shared_collection(uuid) to authenticated;

revoke execute on function public.snapshot_collection_value() from public, anon;
grant execute on function public.snapshot_collection_value() to authenticated;

revoke execute on function public.snapshot_deck_value(uuid) from public, anon;
grant execute on function public.snapshot_deck_value(uuid) to authenticated;

-- Künftige Funktionen (von postgres angelegt) standardmäßig nicht mehr
-- für PUBLIC/anon. authenticated und service_role behalten EXECUTE über
-- die bestehenden Supabase-Default-Privileges für das Schema public.
-- Der PUBLIC-Default ist in Postgres global und lässt sich nicht je
-- Schema entziehen, daher ohne "in schema".
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- ============================================================
-- Migration 005 – Idempotenter Import in Paketen
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Der Client teilt einen Import in Pakete (~100 Karten). Jedes Paket hat
-- einen aus seinem Inhalt berechneten Schlüssel und wird in EINER
-- Transaktion geschrieben: ganz oder gar nicht. Kommt derselbe Schlüssel
-- erneut (Retry nach Abbruch, dieselbe Datei nochmal), wird nichts
-- geschrieben, sondern das gespeicherte Ergebnis zurückgegeben.
-- So entstehen durch erneutes Hochladen keine Dubletten.
-- ============================================================

create table if not exists public.import_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_key text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, batch_key)
);

alter table public.import_batches enable row level security;

-- Nur lesen; geschrieben wird ausschließlich über import_cards_batch().
drop policy if exists "Eigene Import-Pakete lesen" on public.import_batches;
create policy "Eigene Import-Pakete lesen"
  on public.import_batches for select
  using (auth.uid() = user_id);

-- p_rows: [{ i, scryfall_id, name, set_code, collector_number, image_url,
--            mana_cost, cmc, type_line, colors, rarity, oracle_text,
--            quantity, foil, price_eur, price_eur_foil }]
-- Rückgabe: { rows: [{ i, status }], created_at, replayed? }
--   status: imported (neu angelegt) | updated (Menge erhöht) | skipped (schon vorhanden)
create or replace function public.import_cards_batch(
  p_batch_key text,
  p_rows jsonb,
  p_allow_duplicates boolean
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

  -- Gleichzeitige Aufrufe mit demselben Schlüssel (Doppelklick, Retry
  -- während die erste Anfrage noch läuft) nacheinander abarbeiten.
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
        user_id, scryfall_id, name, set_code, collector_number, image_url,
        mana_cost, cmc, type_line, colors, rarity, oracle_text,
        quantity, foil, price_eur, price_eur_foil, price_updated_at
      ) values (
        v_user,
        (v_row->>'scryfall_id')::uuid,
        v_row->>'name',
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
      );
      v_status := 'imported';
    elsif p_allow_duplicates then
      update public.cards
        set quantity = quantity + greatest(1, (v_row->>'quantity')::int),
            price_eur = (v_row->>'price_eur')::numeric,
            price_eur_foil = (v_row->>'price_eur_foil')::numeric,
            price_updated_at = v_now
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

revoke all on function public.import_cards_batch(text, jsonb, boolean) from public, anon;
grant execute on function public.import_cards_batch(text, jsonb, boolean) to authenticated;

-- ============================================================
-- Migration 007 – Deutscher Kartenname für die Suche
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- name_de: null = noch nicht ermittelt, '' = kein deutscher Druck vorhanden.
-- Gefüllt beim Import (import_cards_batch) und für Bestandskarten über
-- /api/cards/german-names (Nachfüllen im Hintergrund).
-- ============================================================

alter table public.cards
  add column if not exists name_de text;

-- import_cards_batch übernimmt name_de aus dem Paket (sonst identisch zu 005).
create or replace function public.import_cards_batch(
  p_batch_key text,
  p_rows jsonb,
  p_allow_duplicates boolean
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

revoke all on function public.import_cards_batch(text, jsonb, boolean) from public, anon;
grant execute on function public.import_cards_batch(text, jsonb, boolean) to authenticated;

-- ============================================================
-- Migration 008 – Preis-Cron: Preise gesammelt schreiben
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Der nächtliche Cron schrieb bisher je Karte 3 Einzel-Requests
-- (Preisverlauf, cards, deck_cards) und lief bei großen Sammlungen ins
-- Zeitlimit. Diese Funktion übernimmt einen ganzen Block Preise in drei
-- mengenbasierten Statements.
-- ============================================================

-- p_prices: [{ "id": "<scryfall uuid>", "eur": 1.23 | null, "eur_foil": 4.56 | null }]
create or replace function public.apply_card_prices(p_prices jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  create temporary table tmp_prices on commit drop as
    select distinct on ((p->>'id')::uuid)
           (p->>'id')::uuid as scryfall_id,
           (p->>'eur')::numeric as eur,
           (p->>'eur_foil')::numeric as eur_foil
    from jsonb_array_elements(p_prices) p;

  insert into public.card_price_history (scryfall_id, captured_on, price_eur, price_eur_foil)
  select scryfall_id, current_date, eur, eur_foil from tmp_prices
  on conflict (scryfall_id, captured_on)
  do update set price_eur = excluded.price_eur,
                price_eur_foil = excluded.price_eur_foil;

  update public.cards c
    set price_eur = t.eur, price_eur_foil = t.eur_foil, price_updated_at = now()
    from tmp_prices t
    where c.scryfall_id = t.scryfall_id;

  update public.deck_cards d
    set price_eur = t.eur, price_eur_foil = t.eur_foil
    from tmp_prices t
    where d.scryfall_id = t.scryfall_id;

  select count(*) into v_count from tmp_prices;
  return v_count;
end;
$$;

-- Nur für den Cron (Service-Role), nicht für Nutzer oder anonyme Aufrufe.
revoke all on function public.apply_card_prices(jsonb) from public, anon, authenticated;
grant execute on function public.apply_card_prices(jsonb) to service_role;

-- ============================================================
-- Migration 009 – Deck-Fundament: Rollen-Cache, Partner, Farbidentität
-- Im Supabase SQL-Editor ausführen. Idempotent.
-- ============================================================

-- Kartenrollen (Ramp, Draw, Removal …) aus Scryfall-Tags, global je
-- Kartenname zwischengespeichert. Lesen dürfen alle Angemeldeten,
-- geschrieben wird nur über save_card_roles().
create table if not exists public.card_roles (
  name text primary key,
  roles text[] not null default '{}',
  fetched_at timestamptz not null default now()
);

alter table public.card_roles enable row level security;

drop policy if exists "Kartenrollen lesen" on public.card_roles;
create policy "Kartenrollen lesen"
  on public.card_roles for select
  to authenticated
  using (true);

-- p_roles: [{ "name": "Sol Ring", "roles": ["ramp"] }]
create or replace function public.save_card_roles(p_roles jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_allowed text[] := array['ramp','draw','removal','wipe','tutor','counter','protection','recursion'];
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;

  insert into public.card_roles (name, roles, fetched_at)
  select distinct on (r->>'name')
         r->>'name',
         -- nur bekannte Rollen übernehmen
         array(select x from jsonb_array_elements_text(r->'roles') x where x = any(v_allowed)),
         now()
  from jsonb_array_elements(p_roles) r
  where coalesce(r->>'name', '') <> ''
  on conflict (name) do update
    set roles = excluded.roles, fetched_at = excluded.fetched_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.save_card_roles(jsonb) from public, anon;
grant execute on function public.save_card_roles(jsonb) to authenticated;

-- Partner/Background: zweiter Commander (Anzeige); Commander-Karten sind
-- alle deck_cards mit is_commander = true.
alter table public.decks
  add column if not exists partner_name text;

-- Farbidentität je Deckkarte (statt nur "colors"), für den Regelcheck
-- und die Farbidentität des Decks (Vereinigung der Commander).
alter table public.deck_cards
  add column if not exists color_identity text[];

-- Eigene Deckkarten aktualisieren (Metadaten nachfüllen).
drop policy if exists "Nutzer bearbeiten eigene Deckkarten" on public.deck_cards;
create policy "Nutzer bearbeiten eigene Deckkarten"
  on public.deck_cards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Migration 010 – Commander-Seite: Scryfall-Cache, Commander-Profile,
-- Gruppen-Statistik, Freundesbesitz gebündelt
-- Im Supabase SQL-Editor ausführen. Idempotent.
-- ============================================================

-- Zwischenspeicher für Scryfall-Suchergebnisse (global, kompakte Karten).
-- Schont das Rate-Limit und macht Commander-Seiten schnell.
create table if not exists public.scryfall_cache (
  key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.scryfall_cache enable row level security;
drop policy if exists "Scryfall-Cache lesen" on public.scryfall_cache;
create policy "Scryfall-Cache lesen"
  on public.scryfall_cache for select to authenticated using (true);

create or replace function public.save_scryfall_cache(p_key text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if length(p_key) > 2000 then raise exception 'Schlüssel zu lang'; end if;
  insert into public.scryfall_cache (key, data, fetched_at)
  values (p_key, p_data, now())
  on conflict (key) do update set data = excluded.data, fetched_at = excluded.fetched_at;
end;
$$;
revoke all on function public.save_scryfall_cache(text, jsonb) from public, anon;
grant execute on function public.save_scryfall_cache(text, jsonb) to authenticated;

-- Commander-Profile (Themen, von Claude aus dem Kartentext abgeleitet).
create table if not exists public.commander_profiles (
  name text primary key,
  themes jsonb not null,
  model text,
  generated_at timestamptz not null default now()
);
alter table public.commander_profiles enable row level security;
drop policy if exists "Commander-Profile lesen" on public.commander_profiles;
create policy "Commander-Profile lesen"
  on public.commander_profiles for select to authenticated using (true);

create or replace function public.save_commander_profile(p_name text, p_themes jsonb, p_model text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  insert into public.commander_profiles (name, themes, model, generated_at)
  values (p_name, p_themes, p_model, now())
  on conflict (name) do update
    set themes = excluded.themes, model = excluded.model, generated_at = excluded.generated_at;
end;
$$;
revoke all on function public.save_commander_profile(text, jsonb, text) from public, anon;
grant execute on function public.save_commander_profile(text, jsonb, text) to authenticated;

-- Eigene + Freundes-IDs (bestätigte Freundschaften).
create or replace function public.my_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid()
  union
  select friend_id from public.friendships where user_id = auth.uid() and status = 'accepted'
  union
  select user_id from public.friendships where friend_id = auth.uid() and status = 'accepted';
$$;
revoke all on function public.my_group_ids() from public, anon;
grant execute on function public.my_group_ids() to authenticated;

-- "In N Decks eurer Gruppe": je Kartenname die Anzahl Decks (eigene +
-- Freunde), die die Karte (nicht als Commander) enthalten.
create or replace function public.group_card_counts(p_names text[])
returns table (name text, decks int)
language sql
stable
security definer
set search_path = public
as $$
  select dc.name, count(distinct dc.deck_id)::int as decks
  from public.deck_cards dc
  where dc.name = any(p_names)
    and not dc.is_commander
    and dc.user_id in (select public.my_group_ids())
  group by dc.name;
$$;
revoke all on function public.group_card_counts(text[]) from public, anon;
grant execute on function public.group_card_counts(text[]) to authenticated;

-- Freundesbesitz für viele Karten in einer Abfrage (statt je Karte ein RPC).
create or replace function public.friends_owning_cards(p_names text[])
returns table (name text, friend_email text, quantity int)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, u.email as friend_email, sum(c.quantity)::int as quantity
  from public.cards c
  join auth.users u on u.id = c.user_id
  where c.name = any(p_names)
    and c.user_id <> auth.uid()
    and c.user_id in (select public.my_group_ids())
  group by c.name, u.email;
$$;
revoke all on function public.friends_owning_cards(text[]) from public, anon;
grant execute on function public.friends_owning_cards(text[]) to authenticated;

-- ============================================================
-- Migration 011 – Deck-Analyse: Manaquellen, Gruppenvergleich
-- Im Supabase SQL-Editor ausführen. Idempotent.
-- ============================================================

-- Welche Farben eine Karte als Mana erzeugen kann (Scryfall produced_mana),
-- für die Mana-Basis-Analyse (Farbsymbole vs. Quellen).
alter table public.deck_cards
  add column if not exists produced_mana text[];

-- Karten, die in vergleichbaren Decks der Gruppe (eigene + Freunde) häufig
-- sind, im angegebenen Deck aber fehlen. Vergleichbar = gleicher Commander,
-- sonst gleiche Farbidentität.
create or replace function public.group_deck_staples(p_deck_id uuid)
returns table (name text, decks int, comparable int)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select d.id, d.commander_name, d.color_identity
    from public.decks d
    where d.id = p_deck_id
      and d.user_id in (select public.my_group_ids())
  ),
  same_commander as (
    select d.id from public.decks d, target t
    where d.id <> t.id
      and d.user_id in (select public.my_group_ids())
      and d.commander_name = t.commander_name
  ),
  comparable as (
    select id from same_commander
    union all
    select d.id from public.decks d, target t
    where not exists (select 1 from same_commander)
      and d.id <> t.id
      and d.user_id in (select public.my_group_ids())
      and coalesce(d.color_identity, '{}') @> coalesce(t.color_identity, '{}')
      and coalesce(d.color_identity, '{}') <@ coalesce(t.color_identity, '{}')
  ),
  n as (select count(*)::int as total from comparable)
  select dc.name, count(distinct dc.deck_id)::int as decks, (select total from n) as comparable
  from public.deck_cards dc
  where dc.deck_id in (select id from comparable)
    and not dc.is_commander
    and coalesce(dc.type_line, '') not ilike 'Basic Land%'
    and dc.name not in (select x.name from public.deck_cards x where x.deck_id = p_deck_id)
  group by dc.name
  order by decks desc, dc.name
  limit 40;
$$;
revoke all on function public.group_deck_staples(uuid) from public, anon;
grant execute on function public.group_deck_staples(uuid) to authenticated;

-- ============================================================
-- Migration 012 – Entdecken: Ranglisten des Freundeskreises
-- Im Supabase SQL-Editor ausführen. Idempotent.
-- ============================================================

-- Meistgespielte Commander und Karten in den Decks der Gruppe
-- (eigene + bestätigte Freunde). kind = 'commander' | 'card'.
create or replace function public.group_rankings()
returns table (kind text, name text, decks int)
language sql
stable
security definer
set search_path = public
as $$
  (
    select 'commander'::text, dc.name, count(distinct dc.deck_id)::int
    from public.deck_cards dc
    where dc.is_commander and dc.user_id in (select public.my_group_ids())
    group by dc.name
    order by 3 desc, 2
    limit 20
  )
  union all
  (
    select 'card'::text, dc.name, count(distinct dc.deck_id)::int
    from public.deck_cards dc
    where not dc.is_commander
      and coalesce(dc.type_line, '') not ilike 'Basic Land%'
      and dc.user_id in (select public.my_group_ids())
    group by dc.name
    order by 3 desc, 2
    limit 40
  );
$$;
revoke all on function public.group_rankings() from public, anon;
grant execute on function public.group_rankings() to authenticated;

-- ============================================================
-- Migration 013 – Ergebnisse kostenpflichtiger KI-Abfragen speichern
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Jede Claude-Abfrage (Deck-Coach, AI Deck Generator) kostet Geld. Das
-- Ergebnis wird gespeichert und bleibt mit Datum abrufbar, statt beim
-- Neuladen verloren zu gehen.
-- ============================================================

create table if not exists public.ai_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('coach', 'deck_generator')),
  deck_id uuid references public.decks(id) on delete set null,
  title text,
  params jsonb not null default '{}',
  result jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_results_user_kind_idx on public.ai_results (user_id, kind, created_at desc);
create index if not exists ai_results_deck_idx on public.ai_results (deck_id, created_at desc);

alter table public.ai_results enable row level security;

drop policy if exists "Eigene KI-Ergebnisse lesen" on public.ai_results;
create policy "Eigene KI-Ergebnisse lesen"
  on public.ai_results for select using (auth.uid() = user_id);

drop policy if exists "Eigene KI-Ergebnisse speichern" on public.ai_results;
create policy "Eigene KI-Ergebnisse speichern"
  on public.ai_results for insert with check (auth.uid() = user_id);

drop policy if exists "Eigene KI-Ergebnisse aktualisieren" on public.ai_results;
create policy "Eigene KI-Ergebnisse aktualisieren"
  on public.ai_results for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Eigene KI-Ergebnisse löschen" on public.ai_results;
create policy "Eigene KI-Ergebnisse löschen"
  on public.ai_results for delete using (auth.uid() = user_id);
