-- ============================================================
-- Migration 035 – Farbfilter im Katalog: genau die gewählten Farben
-- Wie in der Sammlung: Blau = nur einfarbig blaue Karten, Blau + Weiß = nur
-- blau-weiße. Bisher lieferte Blau auch alle mehrfarbigen Karten mit Blau.
-- Sonst unverändert gegenüber Migration 034.
-- ============================================================
create or replace function public.catalog_browse(
  p_search text default '',
  p_in_text boolean default false,
  p_colors text[] default '{}',
  p_rarity text default '',
  p_type text default '',
  p_set text default '',
  p_sort text default 'popular',
  p_limit integer default 60,
  p_offset integer default 0
)
returns table (
  id uuid, oracle_id uuid, name text, name_de text, type_line text, oracle_text text, mana_cost text, cmc real, colors text[],
  rarity text, set text, set_name text, collector_number text, image_url text, eur numeric, eur_foil numeric, edhrec_rank integer, total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select lower(trim(coalesce(p_search, ''))) as s, lower(trim(coalesce(p_type, ''))) as t, lower(trim(coalesce(p_set, ''))) as st
  ),
  words as (
    select array(select w from unnest(regexp_split_to_array((select s from q), '\s+')) w where w <> '') as ws
  ),
  base as (
    select o.id, o.oracle_id, o.name, o.name_de, o.type_line, o.oracle_text, o.mana_cost, o.cmc, o.colors, o.rarity, o.set, o.set_name,
      o.collector_number, o.image_url, o.eur, o.eur_foil, o.edhrec_rank, o.search
    from catalog_oracle o, q where q.st = ''
    union all
    select * from (
      select distinct on (c.oracle_id) c.id, c.oracle_id, c.name, c.name_de, c.type_line, c.oracle_text, c.mana_cost, c.cmc, c.colors, c.rarity, c.set,
        c.set_name, c.collector_number, c.image_url, c.eur, c.eur_foil, c.edhrec_rank,
        lower(c.name || ' ' || coalesce(c.name_de, '') || ' ' || coalesce(c.type_line, '') || ' ' || coalesce(c.oracle_text, '')) as search
      from catalog_cards c, q
      where q.st <> '' and c.set = q.st and c.oracle_id is not null and coalesce(c.layout, '') not in ('art_series', 'emblem')
      order by c.oracle_id, length(c.collector_number), c.collector_number
    ) per_set
  ),
  hits as (
    select b.* from base b, q, words
    where (q.s = '' or (
            case when p_in_text then (select bool_and(b.search like '%' || w || '%') from unnest(words.ws) w)
                 else lower(b.name) like '%' || q.s || '%' or lower(coalesce(b.name_de, '')) like '%' || q.s || '%' end))
      and (coalesce(cardinality(p_colors), 0) = 0 or (b.colors @> p_colors and coalesce(cardinality(b.colors), 0) = cardinality(p_colors)))
      and (coalesce(p_rarity, '') = '' or b.rarity = p_rarity)
      and (q.t = '' or lower(coalesce(b.type_line, '')) like '%' || q.t || '%')
  )
  select h.id, h.oracle_id, h.name, h.name_de, h.type_line, h.oracle_text, h.mana_cost, h.cmc, h.colors, h.rarity, h.set, h.set_name,
    h.collector_number, h.image_url, h.eur, h.eur_foil, h.edhrec_rank, count(*) over () as total
  from hits h
  order by
    case when p_sort = 'color' then
      case when coalesce(cardinality(h.colors), 0) = 0 then 6 when cardinality(h.colors) > 1 then 5
           else array_position(array['W', 'U', 'B', 'R', 'G'], h.colors[1]) - 1 end end,
    case when p_sort = 'cmc' then h.cmc end,
    case when p_sort = 'price' then -coalesce(h.eur, 0) end,
    case when p_sort = 'set' then h.set end,
    case when p_sort = 'set' then lpad(regexp_replace(h.collector_number, '\D', '', 'g'), 5, '0') end,
    case when p_sort = 'popular' then coalesce(h.edhrec_rank, 999999) end,
    h.name
  limit least(greatest(p_limit, 1), 120) offset greatest(p_offset, 0);
$$;
revoke all on function public.catalog_browse(text, boolean, text[], text, text, text, text, integer, integer) from public, anon;
grant execute on function public.catalog_browse(text, boolean, text[], text, text, text, text, integer, integer) to authenticated;
