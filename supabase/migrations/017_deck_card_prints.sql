-- ============================================================
-- Migration 017 – Druck je Deckkarte
-- Im Supabase SQL-Editor ausführen. Idempotent, nur neue Spalten.
--
-- Deckkarten merken sich jetzt den genauen Druck (Set + Sammlernummer)
-- und ob sie Foil sind – so wie die Sammlung. Der Druck lässt sich im Deck
-- ändern. Bestehende Deckkarten werden beim Öffnen des Decks aus Scryfall
-- (über die gespeicherte Scryfall-ID) nachgefüllt.
-- ============================================================

alter table public.deck_cards add column if not exists set_code text;
alter table public.deck_cards add column if not exists collector_number text;
alter table public.deck_cards add column if not exists foil boolean not null default false;
