-- ============================================================
-- Migration 020 – Korrektur zu 019 (bereits angewendet)
-- In der Unterordner-Prüfung bezog sich "parent_id" auf die Unterabfrage
-- (p.parent_id) statt auf die neue Zeile – Unterordner ließen sich nicht
-- anlegen. Jetzt ausdrücklich folders.parent_id. Idempotent.
-- ============================================================
drop policy if exists "Eigene Ordner anlegen" on public.folders;
create policy "Eigene Ordner anlegen" on public.folders for insert with check (
  auth.uid() = user_id
  and (folders.parent_id is null
       or exists (select 1 from public.folders p where p.id = folders.parent_id and p.user_id = auth.uid()))
);
drop policy if exists "Eigene Ordner umbenennen" on public.folders;
create policy "Eigene Ordner umbenennen" on public.folders for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and (folders.parent_id is null
       or exists (select 1 from public.folders p where p.id = folders.parent_id and p.user_id = auth.uid()))
);
