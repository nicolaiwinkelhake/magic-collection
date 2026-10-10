-- ============================================================
-- Migration 008 – Preis-Cron: Preise gesammelt schreiben
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Der nächtliche Cron schrieb bisher je Karte 3 Einzel-Requests
-- (Preisverlauf, cards, deck_cards) und lief bei großen Sammlungen ins
-- Zeitlimit. Diese Funktion übernimmt einen ganzen Block Preise in drei
-- mengenbasierten Statements.
-- ============================================================

-- p_prices: [{ "id": "<scryfall uuid>", "eur": 1.23 | null, "eur_foil": 4.56 | null }]
create or replace function public.apply_card_prices(p_prices jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  create temporary table tmp_prices on commit drop as
    select distinct on ((p->>'id')::uuid)
           (p->>'id')::uuid as scryfall_id,
           (p->>'eur')::numeric as eur,
           (p->>'eur_foil')::numeric as eur_foil
    from jsonb_array_elements(p_prices) p;

  insert into public.card_price_history (scryfall_id, captured_on, price_eur, price_eur_foil)
  select scryfall_id, current_date, eur, eur_foil from tmp_prices
  on conflict (scryfall_id, captured_on)
  do update set price_eur = excluded.price_eur,
                price_eur_foil = excluded.price_eur_foil;

  update public.cards c
    set price_eur = t.eur, price_eur_foil = t.eur_foil, price_updated_at = now()
    from tmp_prices t
    where c.scryfall_id = t.scryfall_id;

  update public.deck_cards d
    set price_eur = t.eur, price_eur_foil = t.eur_foil
    from tmp_prices t
    where d.scryfall_id = t.scryfall_id;

  select count(*) into v_count from tmp_prices;
  return v_count;
end;
$$;

-- Nur für den Cron (Service-Role), nicht für Nutzer oder anonyme Aufrufe.
revoke all on function public.apply_card_prices(jsonb) from public, anon, authenticated;
grant execute on function public.apply_card_prices(jsonb) to service_role;
