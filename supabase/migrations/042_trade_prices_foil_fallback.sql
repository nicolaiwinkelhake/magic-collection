-- ============================================================
-- Migration 042 – Trade-Preise: Foil-Preis, wenn es keinen Normalpreis gibt
-- Drucke, die es nur als Foil gibt (z. B. Jumpstart-Karten aus Foundations),
-- bekamen in offenen Trades keinen Preis, wenn sie als „nicht Foil“
-- eingetragen sind. Jetzt gilt dann der Foil-Preis (wie beim Sammlungswert).
-- Sonst unverändert gegenüber Migration 040.
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

  -- Offene Trades: Tagespreis (wie beim Anlegen: Foil, sonst Normal).
  -- Abgeschlossene Trades behalten den Preis vom Tag des Tauschs.
  update public.trade_items i
    set price_eur_at_trade = case when i.foil then coalesce(t.eur_foil, t.eur) else coalesce(t.eur, t.eur_foil) end
    from tmp_prices t, public.trades tr
    where i.scryfall_id = t.scryfall_id
      and tr.id = i.trade_id and tr.status = 'pending'
      and (case when i.foil then coalesce(t.eur_foil, t.eur) else coalesce(t.eur, t.eur_foil) end) is not null
      and i.price_eur_at_trade is distinct from (case when i.foil then coalesce(t.eur_foil, t.eur) else coalesce(t.eur, t.eur_foil) end);

  select count(*) into v_count from tmp_prices;
  return v_count;
end;
$$;

-- Offene Trades einmal nachziehen
update public.trade_items i
  set price_eur_at_trade = coalesce(h.price_eur, h.price_eur_foil)
  from public.card_price_history h, public.trades tr
  where h.scryfall_id = i.scryfall_id and h.captured_on = (select max(captured_on) from public.card_price_history)
    and tr.id = i.trade_id and tr.status = 'pending'
    and not i.foil and i.price_eur_at_trade is null and coalesce(h.price_eur, h.price_eur_foil) is not null;
