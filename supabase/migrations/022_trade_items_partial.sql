-- ============================================================
-- Migration 022 – Trades: einzelne Karten entfernen / teilweise annehmen
-- 1) remove_trade_item(): Bei einem offenen Trade darf der Anfragende
--    einzelne Karten herausnehmen. Ist danach nichts mehr übrig, gilt der
--    Trade als zurückgezogen.
-- 2) accept_trade(p_trade_id, p_item_ids): Der Partner kann nur einen Teil
--    annehmen – nicht gewählte Karten fallen vor dem Tausch heraus.
--    Ohne p_item_ids wie bisher: alles.
-- 3) my_trades() liefert je Karte zusätzlich die Positions-ID.
-- Idempotent.
-- ============================================================

-- 1) Einzelne Karte entfernen
create or replace function public.remove_trade_item(p_item_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trades;
  v_left integer;
begin
  select tr.* into t
    from public.trade_items ti join public.trades tr on tr.id = ti.trade_id
   where ti.id = p_item_id;
  if t.id is null then raise exception 'Karte nicht gefunden'; end if;
  if t.proposer_id <> auth.uid() then raise exception 'Nur wer den Trade vorgeschlagen hat, kann Karten entfernen'; end if;
  if t.status <> 'pending' then raise exception 'Dieser Trade ist nicht mehr offen'; end if;

  delete from public.trade_items where id = p_item_id;
  select count(*) into v_left from public.trade_items where trade_id = t.id;
  if v_left = 0 then
    update public.trades set status = 'cancelled', resolved_at = now() where id = t.id;
  end if;
  return v_left;
end;
$$;
revoke all on function public.remove_trade_item(uuid) from public, anon;
grant execute on function public.remove_trade_item(uuid) to authenticated;

-- 2) Annehmen, optional nur ausgewählte Karten
drop function if exists public.accept_trade(uuid);
create or replace function public.accept_trade(p_trade_id uuid, p_item_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trades;
  it public.trade_items;
  giver public.cards;
  src public.cards;
  receiver uuid;
  owned int;
  remaining int;
  take int;
begin
  select * into t from public.trades where id = p_trade_id;
  if t.id is null then raise exception 'Trade nicht gefunden'; end if;
  if t.partner_id <> auth.uid() then
    raise exception 'Nur der Handelspartner kann den Trade annehmen';
  end if;
  if t.status <> 'pending' then
    raise exception 'Dieser Trade ist nicht mehr offen';
  end if;

  -- Teilweise annehmen: nicht gewählte Karten fallen heraus
  if p_item_ids is not null then
    delete from public.trade_items where trade_id = p_trade_id and not (id = any(p_item_ids));
    if not exists (select 1 from public.trade_items where trade_id = p_trade_id) then
      raise exception 'Mindestens eine Karte auswählen';
    end if;
  end if;

  for it in select * from public.trade_items where trade_id = p_trade_id loop
    select coalesce(sum(quantity), 0) into owned
      from public.cards
      where user_id = it.from_user_id
        and scryfall_id = it.scryfall_id
        and foil = it.foil;
    if owned < it.quantity then
      raise exception 'Nicht genügend Exemplare von "%" im Bestand', it.name;
    end if;
  end loop;

  for it in select * from public.trade_items where trade_id = p_trade_id loop
    receiver := case when it.from_user_id = t.proposer_id
                     then t.partner_id else t.proposer_id end;

    select * into giver
      from public.cards
      where user_id = it.from_user_id
        and scryfall_id = it.scryfall_id
        and foil = it.foil
      limit 1;

    remaining := it.quantity;
    for src in
      select * from public.cards
        where user_id = it.from_user_id
          and scryfall_id = it.scryfall_id
          and foil = it.foil
        order by created_at
        for update
    loop
      exit when remaining <= 0;
      take := least(remaining, src.quantity);
      if take >= src.quantity then
        delete from public.cards where id = src.id;
      else
        update public.cards set quantity = quantity - take where id = src.id;
      end if;
      remaining := remaining - take;
    end loop;

    update public.cards
      set quantity = quantity + it.quantity
      where user_id = receiver
        and scryfall_id = it.scryfall_id
        and foil = it.foil;

    if not found then
      insert into public.cards (
        user_id, scryfall_id, name, set_code, collector_number, image_url,
        mana_cost, cmc, type_line, colors, rarity, oracle_text,
        quantity, foil, price_eur, price_eur_foil, price_updated_at
      )
      values (
        receiver, it.scryfall_id, it.name, giver.set_code, giver.collector_number,
        coalesce(giver.image_url, it.image_url), giver.mana_cost, giver.cmc,
        giver.type_line, giver.colors, giver.rarity, giver.oracle_text,
        it.quantity, it.foil, giver.price_eur, giver.price_eur_foil, now()
      );
    end if;
  end loop;

  update public.trades
    set status = 'accepted', resolved_at = now()
    where id = p_trade_id;
end;
$$;
revoke all on function public.accept_trade(uuid, uuid[]) from public, anon;
grant execute on function public.accept_trade(uuid, uuid[]) to authenticated;

-- 3) Positions-ID mitliefern
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
        'id', ti.id, 'name', ti.name, 'image_url', ti.image_url, 'foil', ti.foil, 'quantity', ti.quantity,
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
