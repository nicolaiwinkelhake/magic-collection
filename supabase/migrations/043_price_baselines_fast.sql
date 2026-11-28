-- ============================================================
-- Migration 043 – Frühere Preise der eigenen Karten schnell laden
-- /api/prices/baseline las bisher den ganzen Preisverlauf der gewählten Tage
-- seitenweise (> 10 000 Zeilen, ohne passenden Index ~0,7 s je Seite) und lief
-- in der App in den Zeitabbruch → keine Prozente auf den Kacheln.
-- - Index auf captured_on
-- - my_price_baselines(p_dates): nur Drucke der eigenen Sammlung, als ein
--   JSON-Objekt { "YYYY-MM-DD": { scryfall_id: [eur, eur_foil] } }
-- ============================================================
create index if not exists card_price_history_captured_on_idx
  on public.card_price_history (captured_on, scryfall_id);

create or replace function public.my_price_baselines(p_dates date[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(d, ids), '{}'::jsonb)
  from (
    select h.captured_on::text as d,
           jsonb_object_agg(h.scryfall_id::text, jsonb_build_array(h.price_eur, h.price_eur_foil)) as ids
    from public.card_price_history h
    where h.captured_on = any(p_dates)
      and h.scryfall_id in (select c.scryfall_id from public.cards c where c.user_id = auth.uid())
    group by h.captured_on
  ) x;
$$;
revoke all on function public.my_price_baselines(date[]) from public, anon;
grant execute on function public.my_price_baselines(date[]) to authenticated;
