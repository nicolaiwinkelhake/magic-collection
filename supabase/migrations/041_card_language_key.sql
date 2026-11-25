-- ============================================================
-- Migration 041 – Sprache je Sammlungseintrag
-- Bisher gab es je Nutzer genau einen Eintrag je Druck + Foil – ein deutsches
-- und ein englisches Exemplar derselben Version wurden zusammengelegt und
-- teilten sich eine Sprache. Jetzt ist die Sprache Teil der Eindeutigkeit:
-- (Nutzer, Druck, Foil, Sprache). Der Scanner speichert deutsch erkannte
-- Karten als „DE“.
-- - Sprachkürzel vereinheitlicht (Großbuchstaben)
-- - import_cards_batch: legt je Sprache zusammen, übernimmt p_rows.language
-- - accept_trade: Empfänger bekommt die Sprache des Geber-Exemplars
-- ============================================================
update public.cards set language = upper(language) where language is distinct from upper(language);

alter table public.cards drop constraint if exists cards_user_id_scryfall_id_foil_key;
alter table public.cards add constraint cards_user_print_foil_language_key unique (user_id, scryfall_id, foil, language);

create or replace function public.import_cards_batch(
  p_batch_key text,
  p_rows jsonb,
  p_allow_duplicates boolean,
  p_folder_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_previous jsonb;
  v_row jsonb;
  v_existing_id uuid;
  v_status text;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  if p_folder_id is not null
     and not exists (select 1 from public.folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Ordner nicht gefunden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_batch_key, 0));

  select result into v_previous
    from public.import_batches
    where user_id = v_user and batch_key = p_batch_key;
  if found then
    return v_previous || jsonb_build_object('replayed', true);
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    select id into v_existing_id
      from public.cards
      where user_id = v_user
        and scryfall_id = (v_row->>'scryfall_id')::uuid
        and foil = (v_row->>'foil')::boolean
        and language = coalesce(upper(nullif(v_row->>'language', '')), 'EN')
      for update;

    if v_existing_id is null then
      insert into public.cards (
        user_id, scryfall_id, name, name_de, set_code, collector_number, image_url,
        mana_cost, cmc, type_line, colors, rarity, oracle_text,
        quantity, foil, language, price_eur, price_eur_foil, price_updated_at
      ) values (
        v_user,
        (v_row->>'scryfall_id')::uuid,
        v_row->>'name',
        v_row->>'name_de',
        v_row->>'set_code',
        v_row->>'collector_number',
        v_row->>'image_url',
        v_row->>'mana_cost',
        coalesce((v_row->>'cmc')::numeric, 0),
        v_row->>'type_line',
        coalesce(array(select jsonb_array_elements_text(v_row->'colors')), '{}'),
        v_row->>'rarity',
        v_row->>'oracle_text',
        greatest(1, (v_row->>'quantity')::int),
        (v_row->>'foil')::boolean,
        coalesce(upper(nullif(v_row->>'language', '')), 'EN'),
        (v_row->>'price_eur')::numeric,
        (v_row->>'price_eur_foil')::numeric,
        v_now
      )
      returning id into v_existing_id;
      v_status := 'imported';
    elsif p_allow_duplicates then
      update public.cards
        set quantity = quantity + greatest(1, (v_row->>'quantity')::int),
            price_eur = (v_row->>'price_eur')::numeric,
            price_eur_foil = (v_row->>'price_eur_foil')::numeric,
            price_updated_at = v_now,
            name_de = coalesce(name_de, v_row->>'name_de')
        where id = v_existing_id;
      v_status := 'updated';
    else
      v_status := 'skipped';
    end if;

    if p_folder_id is not null then
      insert into public.folder_entries (user_id, folder_id, card_id)
        values (v_user, p_folder_id, v_existing_id)
        on conflict do nothing;
    end if;

    if v_status <> 'skipped' then
      insert into public.card_price_history (scryfall_id, captured_on, price_eur, price_eur_foil)
      values ((v_row->>'scryfall_id')::uuid, current_date,
              (v_row->>'price_eur')::numeric, (v_row->>'price_eur_foil')::numeric)
      on conflict (scryfall_id, captured_on)
      do update set price_eur = excluded.price_eur,
                    price_eur_foil = excluded.price_eur_foil;
    end if;

    v_results := v_results || jsonb_build_object('i', v_row->'i', 'status', v_status);
    v_existing_id := null;
  end loop;

  v_result := jsonb_build_object('rows', v_results, 'created_at', v_now);
  insert into public.import_batches (user_id, batch_key, result)
  values (v_user, p_batch_key, v_result);

  perform public.snapshot_collection_value();

  return v_result;
end;
$$;
revoke all on function public.import_cards_batch(text, jsonb, boolean, uuid) from public, anon;
grant execute on function public.import_cards_batch(text, jsonb, boolean, uuid) to authenticated;

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

      -- Empfänger: gleicher Druck, Foil und Sprache wie beim Geber
      update public.cards
        set quantity = quantity + take
        where user_id = receiver
          and scryfall_id = it.scryfall_id
          and foil = it.foil
          and language = src.language;
      if not found then
        insert into public.cards (
          user_id, scryfall_id, name, set_code, collector_number, image_url,
          mana_cost, cmc, type_line, colors, rarity, oracle_text,
          quantity, foil, language, price_eur, price_eur_foil, price_updated_at
        )
        values (
          receiver, it.scryfall_id, it.name, giver.set_code, giver.collector_number,
          coalesce(giver.image_url, it.image_url), giver.mana_cost, giver.cmc,
          giver.type_line, giver.colors, giver.rarity, giver.oracle_text,
          take, it.foil, src.language, giver.price_eur, giver.price_eur_foil, now()
        );
      end if;
    end loop;
  end loop;

  update public.trades
    set status = 'accepted', resolved_at = now()
    where id = p_trade_id;
end;
$$;
revoke all on function public.accept_trade(uuid, uuid[]) from public, anon;
grant execute on function public.accept_trade(uuid, uuid[]) to authenticated;
