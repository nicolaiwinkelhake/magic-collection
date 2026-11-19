-- ============================================================
-- Migration 021 – Trades: genaue Karten-ID mitliefern
-- my_trades() gibt je Trade-Karte zusätzlich scryfall_id zurück, damit die
-- Trades-Seite das Kartendetail mit genauem Druck (Set, Nummer) zeigen kann.
-- Nur die Ausgabe ändert sich, keine Daten. Idempotent.
-- ============================================================

create or replace function public.my_trades()
returns table(id uuid, status text, note text, created_at timestamptz, resolved_at timestamptz,
              proposer_id uuid, partner_id uuid, proposer_email text, partner_email text,
              i_am_proposer boolean, items jsonb)
language sql
security definer
set search_path = public
as $$
  select t.id, t.status, t.note, t.created_at, t.resolved_at, t.proposer_id, t.partner_id, pu.email, au.email,
    (t.proposer_id = auth.uid()),
    coalesce((select jsonb_agg(jsonb_build_object(
        'name', ti.name, 'image_url', ti.image_url, 'foil', ti.foil, 'quantity', ti.quantity,
        'price', ti.price_eur_at_trade, 'from_user_id', ti.from_user_id, 'scryfall_id', ti.scryfall_id
      ) order by ti.name) from public.trade_items ti where ti.trade_id = t.id), '[]'::jsonb)
  from public.trades t
  join auth.users pu on pu.id = t.proposer_id
  join auth.users au on au.id = t.partner_id
  where t.proposer_id = auth.uid() or t.partner_id = auth.uid()
  order by t.created_at desc;
$$;

revoke execute on function public.my_trades() from public, anon;
grant execute on function public.my_trades() to authenticated;
