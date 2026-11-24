-- ============================================================
-- Migration 036 – Push-Mitteilungen
-- Je Gerät (Browser/Homescreen-App) ein Push-Abo; je Nutzer Einstellungen,
-- welche Mitteilungen er bekommen will. Verschickt wird serverseitig mit
-- dem Service-Role-Key (lib/push.ts).
-- ============================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "Eigene Push-Abos lesen" on public.push_subscriptions;
create policy "Eigene Push-Abos lesen" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists "Eigene Push-Abos löschen" on public.push_subscriptions;
create policy "Eigene Push-Abos löschen" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Abo dieses Geräts speichern. Meldet sich auf dem Gerät jemand anderes an,
-- wandert das Abo zu ihm (ein Endpunkt gehört immer genau einem Nutzer).
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  select auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300)
  where auth.uid() is not null
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen_at = now();
$$;
revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trades boolean not null default true,
  friends boolean not null default true,
  shares boolean not null default true,
  loans boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
drop policy if exists "Eigene Mitteilungs-Einstellungen" on public.notification_prefs;
create policy "Eigene Mitteilungs-Einstellungen" on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
