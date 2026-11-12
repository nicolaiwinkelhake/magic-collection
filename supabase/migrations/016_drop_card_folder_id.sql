-- ============================================================
-- Migration 016 – Aufräumen nach 015
-- ERST ausführen, wenn die App-Version mit Mehrfach-Ordnern live ist.
-- Idempotent.
--
-- Entfernt die alte Einfach-Zuordnung (cards.folder_id) samt der darauf
-- aufbauenden Eindeutigkeit und der Funktion move_cards.
-- ============================================================

drop function if exists public.move_cards(uuid[], uuid);
alter table public.cards drop constraint if exists cards_unique_printing_folder;
drop index if exists public.cards_folder_idx;
alter table public.cards drop column if exists folder_id;
