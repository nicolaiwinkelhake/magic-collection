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
