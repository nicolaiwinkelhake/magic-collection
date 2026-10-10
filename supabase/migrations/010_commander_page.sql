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
