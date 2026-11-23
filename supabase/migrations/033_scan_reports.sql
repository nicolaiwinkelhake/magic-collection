-- ============================================================
-- Migration 033 – Scanner verbessern: Fehlschläge sammeln (freiwillig)
-- Nur wenn im Scanner eingeschaltet: Bei nicht erkannten oder von Hand
-- korrigierten Karten ein kleiner Ausschnitt der Karte (JPEG) mit dem, was
-- gelesen wurde, und dem, was richtig gewesen wäre. Jeder sieht und löscht
-- nur seine eigenen Meldungen; ausgewertet wird mit Datenbankzugriff.
-- ============================================================
create table if not exists public.scan_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- miss = nicht erkannt, print_fix = anderer Druck gewählt, list_swap = The List ↔ Original getauscht
  kind text not null check (kind in ('miss', 'print_fix', 'list_swap')),
  read jsonb,
  scanned jsonb,
  corrected jsonb,
  image text check (image is null or (image like 'data:image/jpeg;base64,%' and length(image) < 300000))
);

create index if not exists scan_reports_created_idx on public.scan_reports (created_at desc);

alter table public.scan_reports enable row level security;

create policy "Eigene Scan-Meldungen anlegen" on public.scan_reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "Eigene Scan-Meldungen lesen" on public.scan_reports
  for select to authenticated using (user_id = auth.uid());
create policy "Eigene Scan-Meldungen löschen" on public.scan_reports
  for delete to authenticated using (user_id = auth.uid());
