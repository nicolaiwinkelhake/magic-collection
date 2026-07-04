-- ============================================================
-- Migration 004 – Kartendetails: Zustand & Sprache
-- Im Supabase SQL-Editor ausführen. Idempotent.
-- ============================================================

alter table public.cards
  add column if not exists condition text not null default 'NM',
  add column if not exists language text not null default 'EN';

-- Erlaubte Zustände: NM (Near Mint), LP (Lightly Played), MP (Moderately
-- Played), HP (Heavily Played), DMG (Damaged). Sprache als ISO-Kürzel (EN, DE …).
