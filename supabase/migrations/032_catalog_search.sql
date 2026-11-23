-- ============================================================
-- Migration 032 – Katalog: Kartensuche für die Handeingabe im Scanner
-- „Beginnt mit“ (englischer oder deutscher Name) über die vorhandenen
-- Namensindizes als Bereichsabfrage – schnell auch bei kurzen Anfängen wie
-- „dra“. Findet das zu wenig und sind mindestens 4 Zeichen getippt, zählt
-- auch ein Wortanfang im Namen („bolt“ → Lightning Bolt). Je Karte der
-- Standarddruck (wie Scryfall), beliebte Karten zuerst. Kunstkarten
-- (Art Series) bleiben draußen.
-- ============================================================
create or replace function public.catalog_search(p_query text, p_limit int default 8)
returns setof public.catalog_cards
language sql
stable
security definer
set search_path = public
as $$
  with q as (select lower(trim(p_query)) as q),
  pre as (
    (select c.oracle_id, 0 as rk from catalog_cards c, q
      where length(q.q) >= 2 and lower(c.name) >= q.q and lower(c.name) < q.q || chr(65535) and lower(c.name) like q.q || '%' and c.oracle_id is not null
      order by lower(c.name) limit 400)
    union all
    (select c.oracle_id, 0 from catalog_cards c, q
      where length(q.q) >= 2 and lower(c.name_de) >= q.q and lower(c.name_de) < q.q || chr(65535) and lower(c.name_de) like q.q || '%' and c.oracle_id is not null
      order by lower(c.name_de) limit 400)
  ),
  word as (
    select c.oracle_id, 1 as rk from catalog_cards c, q
    where length(q.q) >= 4 and (select count(distinct oracle_id) from pre) < 10
      and (lower(c.name) like '% ' || q.q || '%' or lower(c.name_de) like '% ' || q.q || '%') and c.oracle_id is not null
    limit 300
  ),
  best as (select oracle_id, min(rk) as rk from (select * from pre union all select * from word) a group by oracle_id)
  select d.* from best b
  join catalog_defaults df on df.oracle_id = b.oracle_id
  join catalog_cards d on d.id = df.card_id
  where coalesce(d.layout, '') <> 'art_series'
  order by b.rk, d.edhrec_rank nulls last, d.name
  limit least(greatest(p_limit, 1), 30);
$$;

revoke all on function public.catalog_search(text, int) from public, anon;
grant execute on function public.catalog_search(text, int) to authenticated;
