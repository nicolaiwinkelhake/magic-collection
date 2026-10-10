-- ============================================================
-- Migration 013 – Ergebnisse kostenpflichtiger KI-Abfragen speichern
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Jede Claude-Abfrage (Deck-Coach, AI Deck Generator) kostet Geld. Das
-- Ergebnis wird gespeichert und bleibt mit Datum abrufbar, statt beim
-- Neuladen verloren zu gehen.
-- ============================================================

create table if not exists public.ai_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('coach', 'deck_generator')),
  deck_id uuid references public.decks(id) on delete set null,
  title text,
  params jsonb not null default '{}',
  result jsonb not null,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_results_user_kind_idx on public.ai_results (user_id, kind, created_at desc);
create index if not exists ai_results_deck_idx on public.ai_results (deck_id, created_at desc);

alter table public.ai_results enable row level security;

drop policy if exists "Eigene KI-Ergebnisse lesen" on public.ai_results;
create policy "Eigene KI-Ergebnisse lesen"
  on public.ai_results for select using (auth.uid() = user_id);

drop policy if exists "Eigene KI-Ergebnisse speichern" on public.ai_results;
create policy "Eigene KI-Ergebnisse speichern"
  on public.ai_results for insert with check (auth.uid() = user_id);

drop policy if exists "Eigene KI-Ergebnisse aktualisieren" on public.ai_results;
create policy "Eigene KI-Ergebnisse aktualisieren"
  on public.ai_results for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Eigene KI-Ergebnisse löschen" on public.ai_results;
create policy "Eigene KI-Ergebnisse löschen"
  on public.ai_results for delete using (auth.uid() = user_id);
