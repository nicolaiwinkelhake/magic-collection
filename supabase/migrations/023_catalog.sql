-- ============================================================
-- Migration 023 – Karten-Katalog: alle Magic-Drucke in der eigenen DB
-- Quelle: Scryfall-Gesamtdatei "default_cards" (jeder Druck auf Englisch
-- bzw. in der einzigen Drucksprache), täglich abgeglichen per Vercel-Cron
-- (/api/cron/catalog). Deutsche Namen aus "all_cards" (wöchentlich).
-- Bilder bleiben bei Scryfall (nur der Link wird gespeichert).
-- Lesbar für angemeldete Nutzer; geschrieben wird nur mit dem Service-Key.
-- Idempotent.
-- ============================================================

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.catalog_cards (
  id uuid primary key,                -- Scryfall-ID = genauer Druck
  oracle_id uuid,
  name text not null,
  name_de text,                       -- gedruckter deutscher Name (Vorderseite)
  lang text,
  set text not null,
  set_name text,
  collector_number text not null,
  rarity text,
  layout text,
  type_line text,
  mana_cost text,
  cmc real,
  colors text[],
  color_identity text[],
  oracle_text text,
  power text,
  toughness text,
  image_url text,                     -- Scryfall-Bild (normal, Vorderseite)
  eur numeric(10, 2),
  eur_foil numeric(10, 2),
  released_at date,
  cardmarket_id integer,
  frame text,
  border_color text,
  full_art boolean,
  promo boolean,
  finishes text[],
  updated_at timestamptz not null default now()
);

create index if not exists catalog_cards_set_number_idx on public.catalog_cards (set, collector_number);
create index if not exists catalog_cards_oracle_idx on public.catalog_cards (oracle_id);
create index if not exists catalog_cards_name_idx on public.catalog_cards (lower(name));
create index if not exists catalog_cards_name_trgm on public.catalog_cards using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists catalog_cards_name_de_trgm on public.catalog_cards using gin (lower(name_de) extensions.gin_trgm_ops) where name_de is not null;

alter table public.catalog_cards enable row level security;
drop policy if exists "Katalog lesen" on public.catalog_cards;
create policy "Katalog lesen" on public.catalog_cards for select to authenticated using (true);

-- Stand des Abgleichs (welche Gesamtdatei, wie weit, wann fertig)
create table if not exists public.catalog_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.catalog_meta enable row level security;
drop policy if exists "Katalog-Stand lesen" on public.catalog_meta;
create policy "Katalog-Stand lesen" on public.catalog_meta for select to authenticated using (true);

-- Wer Wartungsaufgaben (z. B. Katalog jetzt abgleichen) auslösen darf
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
drop policy if exists "Eigenen Admin-Status sehen" on public.app_admins;
create policy "Eigenen Admin-Status sehen" on public.app_admins for select to authenticated using (auth.uid() = user_id);
