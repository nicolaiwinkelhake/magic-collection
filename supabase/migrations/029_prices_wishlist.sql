-- ============================================================
-- Migration 029 – Tagespreise auch für die Wunschliste
-- apply_card_prices setzt den Preis jetzt zusätzlich in wishlist (nur
-- Normalpreis, die Wunschliste kennt kein Foil). Sonst unverändert.
-- ============================================================
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

  -- Wunschliste: Normalpreis, sonst Foil-Preis (manche Karten gibt es nur als Foil)
  update public.wishlist w
    set price_eur = coalesce(t.eur, t.eur_foil)
    from tmp_prices t
    where w.scryfall_id = t.scryfall_id
      and w.price_eur is distinct from coalesce(t.eur, t.eur_foil);

  select count(*) into v_count from tmp_prices;
  return v_count;
end;
$$;
