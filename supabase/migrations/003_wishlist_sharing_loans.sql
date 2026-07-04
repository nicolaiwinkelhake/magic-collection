-- ============================================================
-- Migration 003 – Wunschliste, Sammlungs-Freigabe, Leihen,
--                  Deck-Wertverlauf
-- Im Supabase SQL-Editor ausführen. Idempotent, wo möglich.
-- ============================================================

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
