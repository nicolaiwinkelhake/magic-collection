-- ============================================================
-- Migration 005 – Idempotenter Import in Paketen
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Der Client teilt einen Import in Pakete (~100 Karten). Jedes Paket hat
-- einen aus seinem Inhalt berechneten Schlüssel und wird in EINER
-- Transaktion geschrieben: ganz oder gar nicht. Kommt derselbe Schlüssel
-- erneut (Retry nach Abbruch, dieselbe Datei nochmal), wird nichts
-- geschrieben, sondern das gespeicherte Ergebnis zurückgegeben.
-- So entstehen durch erneutes Hochladen keine Dubletten.
-- ============================================================

create table if not exists public.import_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_key text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, batch_key)
);

alter table public.import_batches enable row level security;

-- Nur lesen; geschrieben wird ausschließlich über import_cards_batch().
drop policy if exists "Eigene Import-Pakete lesen" on public.import_batches;
create policy "Eigene Import-Pakete lesen"
  on public.import_batches for select
  using (auth.uid() = user_id);

-- p_rows: [{ i, scryfall_id, name, set_code, collector_number, image_url,
--            mana_cost, cmc, type_line, colors, rarity, oracle_text,
--            quantity, foil, price_eur, price_eur_foil }]
-- Rückgabe: { rows: [{ i, status }], created_at, replayed? }
--   status: imported (neu angelegt) | updated (Menge erhöht) | skipped (schon vorhanden)
create or replace function public.import_cards_batch(
  p_batch_key text,
  p_rows jsonb,
  p_allow_duplicates boolean
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

  -- Gleichzeitige Aufrufe mit demselben Schlüssel (Doppelklick, Retry
  -- während die erste Anfrage noch läuft) nacheinander abarbeiten.
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
      for update;

    if v_existing_id is null then
      insert into public.cards (
        user_id, scryfall_id, name, set_code, collector_number, image_url,
        mana_cost, cmc, type_line, colors, rarity, oracle_text,
        quantity, foil, price_eur, price_eur_foil, price_updated_at
      ) values (
        v_user,
        (v_row->>'scryfall_id')::uuid,
        v_row->>'name',
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
        (v_row->>'price_eur')::numeric,
        (v_row->>'price_eur_foil')::numeric,
        v_now
      );
      v_status := 'imported';
    elsif p_allow_duplicates then
      update public.cards
        set quantity = quantity + greatest(1, (v_row->>'quantity')::int),
            price_eur = (v_row->>'price_eur')::numeric,
            price_eur_foil = (v_row->>'price_eur_foil')::numeric,
            price_updated_at = v_now
        where id = v_existing_id;
      v_status := 'updated';
    else
      v_status := 'skipped';
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

revoke all on function public.import_cards_batch(text, jsonb, boolean) from public, anon;
grant execute on function public.import_cards_batch(text, jsonb, boolean) to authenticated;
