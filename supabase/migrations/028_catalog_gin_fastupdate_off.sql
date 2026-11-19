-- ============================================================
-- Migration 028 – Katalog: Suchindizes ohne Sammel-Liste
-- GIN-Indizes sammeln Änderungen standardmäßig und tragen sie gelegentlich
-- auf einen Schlag nach – beim nächtlichen Abgleich (111.000 Zeilen) ließ
-- das einzelne Speicherblöcke in die 8-s-Grenze laufen. Ohne Sammel-Liste
-- wird gleichmäßig eingetragen.
-- ============================================================
alter index public.catalog_cards_name_trgm set (fastupdate = off);
alter index public.catalog_cards_name_de_trgm set (fastupdate = off);
