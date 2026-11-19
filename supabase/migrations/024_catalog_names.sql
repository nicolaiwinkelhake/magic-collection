-- ============================================================
-- Migration 024 – Katalog: deutsche Namen setzen
-- Wird vom Katalog-Abgleich (Service-Key) aufgerufen:
-- p = [{ "oracle_id": uuid, "name_de": text }, …] → setzt name_de für alle
-- Drucke dieser Karte. Nur für den Service-Key ausführbar.
-- ============================================================
create or replace function public.catalog_set_names(p jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with src as (
    select (x->>'oracle_id')::uuid as oracle_id, x->>'name_de' as name_de
    from jsonb_array_elements(coalesce(p, '[]'::jsonb)) x
  ), upd as (
    update public.catalog_cards c set name_de = src.name_de
    from src where c.oracle_id = src.oracle_id and c.name_de is distinct from src.name_de
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke all on function public.catalog_set_names(jsonb) from public, anon, authenticated;
grant execute on function public.catalog_set_names(jsonb) to service_role;
