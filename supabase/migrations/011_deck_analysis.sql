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
