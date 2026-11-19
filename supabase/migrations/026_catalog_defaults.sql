-- ============================================================
-- Migration 026 – Katalog: Standarddruck je Karte
-- Aus Scryfalls Gesamtdatei "oracle_cards" (ein Druck je Karte – derselbe,
-- den Scryfall bei einer reinen Namenssuche liefert; geprüft an 53 Karten).
-- So wählt die eigene Datenbank bei einer Namenseingabe genau denselben
-- Druck wie bisher.
-- ============================================================
create table if not exists public.catalog_defaults (
  oracle_id uuid primary key,
  card_id uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.catalog_defaults enable row level security;
drop policy if exists "Standarddrucke lesen" on public.catalog_defaults;
create policy "Standarddrucke lesen" on public.catalog_defaults for select to authenticated using (true);
