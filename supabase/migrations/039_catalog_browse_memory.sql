-- ============================================================
-- Migration 039 – Katalog schneller laden
-- Die Startansicht des Katalogs (alle ~34.000 Karten, sortiert, mit
-- Trefferzahl) wich mit dem Standard-Arbeitsspeicher beim Sortieren auf die
-- Platte aus (≈ 1,8 s). Mit 32 MB für diese eine Funktion: ≈ 0,16 s.
-- ============================================================
alter function public.catalog_browse(text, boolean, text[], text, text, text, text, integer, integer)
  set work_mem = '32MB';
