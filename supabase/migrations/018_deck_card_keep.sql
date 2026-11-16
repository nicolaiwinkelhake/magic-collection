-- "Karte behalten": Der Deck-Check schlägt so markierte Karten nie zum
-- Rausnehmen vor (Lieblingskarten, bewusste Entscheidungen).
alter table public.deck_cards add column if not exists keep boolean not null default false;
