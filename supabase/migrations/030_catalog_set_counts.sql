-- ============================================================
-- Migration 030 – Katalog: Drucke je Set (für die Set-Übersicht)
-- ============================================================
create or replace function public.catalog_set_counts(p_sets text[])
returns table(set text, prints integer)
language sql
stable
set search_path = public
as $$
  select c.set, count(*)::integer from public.catalog_cards c where c.set = any(p_sets) group by c.set;
$$;
revoke all on function public.catalog_set_counts(text[]) from public, anon;
grant execute on function public.catalog_set_counts(text[]) to authenticated, service_role;
