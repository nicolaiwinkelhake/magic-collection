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
  created_at timestamptz not null default now()
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
