-- ============================================================
-- Migration 025 – Katalog: weitere Angaben, damit er Scryfall-Abfragen
-- gleichwertig ersetzen kann (Decks: erzeugtes Mana; Commander: Rang,
-- Game Changer; Standarddruck wählen: Set-Art, Rahmeneffekte, Varianten).
-- ============================================================
alter table public.catalog_cards
  add column if not exists produced_mana text[],
  add column if not exists edhrec_rank integer,
  add column if not exists game_changer boolean,
  add column if not exists set_type text,
  add column if not exists frame_effects text[],
  add column if not exists promo_types text[],
  add column if not exists variation boolean,
  add column if not exists oversized boolean,
  add column if not exists textless boolean;

create index if not exists catalog_cards_front_name_idx on public.catalog_cards (lower(split_part(name, ' // ', 1)));
create index if not exists catalog_cards_name_de_idx on public.catalog_cards (lower(name_de)) where name_de is not null;
