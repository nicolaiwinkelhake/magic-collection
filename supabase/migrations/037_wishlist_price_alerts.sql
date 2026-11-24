-- ============================================================
-- Migration 037 – Mitteilungen: Wunschliste bei Freunden & Preise
-- Täglich (Cron /api/cron/alerts): Karten von der Wunschliste, die ein Freund
-- in seiner mit dir geteilten Sammlung hat, und starke Preisbewegungen in
-- der eigenen Sammlung. Bereits gemeldete Wunschlisten-Treffer werden gemerkt,
-- damit jede Karte nur einmal gemeldet wird (verschwindet sie beim Freund
-- und taucht wieder auf, gibt es eine neue Mitteilung).
-- ============================================================
alter table public.notification_prefs
  add column if not exists wishlist boolean not null default true,
  add column if not exists prices boolean not null default true;

create table if not exists public.wishlist_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  card_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, owner_id, card_name)
);
-- nur der Server (Service-Role) liest und schreibt
alter table public.wishlist_alerts enable row level security;

-- Alle Treffer: Karte auf der Wunschliste von user_id, die owner_id besitzt
-- und dessen Sammlung mit user_id geteilt ist.
create or replace function public.wishlist_friend_matches()
returns table (user_id uuid, owner_id uuid, owner_email text, card_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct w.user_id, s.owner_id, u.email::text, w.name
  from wishlist w
  join collection_shares s on s.viewer_id = w.user_id
  join cards c on c.user_id = s.owner_id and c.name = w.name and c.quantity > 0
  join auth.users u on u.id = s.owner_id
  where s.owner_id <> w.user_id;
$$;
revoke all on function public.wishlist_friend_matches() from public, anon, authenticated;
grant execute on function public.wishlist_friend_matches() to service_role;

-- Was es heute schon gibt, gilt als bekannt: gemeldet wird nur Neues.
insert into public.wishlist_alerts (user_id, owner_id, card_name)
select m.user_id, m.owner_id, m.card_name from public.wishlist_friend_matches() m
on conflict do nothing;
