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
