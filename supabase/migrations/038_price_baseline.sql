-- ============================================================
-- Migration 038 – Preise zu Beginn eines Zeitraums (Wertverlauf)
-- Für „Gewinner & Verlierer“: je Druck der eigenen Sammlung der erste
-- gespeicherte Preis ab dem Stichtag. Reicht der Verlauf nicht so weit
-- zurück (z. B. „3 Jahre“), ist das der älteste vorhandene Preis.
-- ============================================================
create or replace function public.price_baseline(p_since date)
returns table (scryfall_id uuid, captured_on date, price_eur numeric, price_eur_foil numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (h.scryfall_id) h.scryfall_id, h.captured_on, h.price_eur, h.price_eur_foil
  from card_price_history h
  where h.scryfall_id in (select c.scryfall_id from cards c where c.user_id = auth.uid())
    and h.captured_on >= p_since
  order by h.scryfall_id, h.captured_on;
$$;
revoke all on function public.price_baseline(date) from public, anon;
grant execute on function public.price_baseline(date) to authenticated;
