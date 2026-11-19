-- ============================================================
-- Migration 027 – Katalog: Namen nachschlagen
-- Je Eingabe (englischer Name, nur Vorderseite oder gedruckter deutscher
-- Name; Groß-/Kleinschreibung egal) die Karte (oracle_id) und ihren
-- Standarddruck (card_id, wie Scryfalls Namenssuche). Englisch hat Vorrang.
-- ============================================================
create or replace function public.catalog_lookup_names(p_names text[])
returns table(input text, oracle_id uuid, card_id uuid)
language sql
stable
set search_path = public
as $$
  with inp as (
    select distinct lower(btrim(n)) as n from unnest(p_names) n where btrim(n) <> ''
  ), hit as (
    select inp.n, c.oracle_id, 1 as prio from inp join public.catalog_cards c on lower(c.name) = inp.n
    union all
    select inp.n, c.oracle_id, 2 from inp join public.catalog_cards c on lower(split_part(c.name, ' // ', 1)) = inp.n
    union all
    select inp.n, c.oracle_id, 3 from inp join public.catalog_cards c on lower(c.name_de) = inp.n
  ), best as (
    select distinct on (n) n, oracle_id from hit where oracle_id is not null order by n, prio
  )
  select b.n, b.oracle_id, d.card_id from best b left join public.catalog_defaults d on d.oracle_id = b.oracle_id;
$$;
revoke all on function public.catalog_lookup_names(text[]) from public, anon;
grant execute on function public.catalog_lookup_names(text[]) to authenticated, service_role;
