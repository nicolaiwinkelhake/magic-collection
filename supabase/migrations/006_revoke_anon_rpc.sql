-- ============================================================
-- Migration 006 – SECURITY-DEFINER-Funktionen nicht mehr für anon
-- Im Supabase SQL-Editor ausführen. Idempotent.
--
-- Postgres gibt jeder neuen Funktion EXECUTE an PUBLIC, Supabase
-- zusätzlich an anon. Damit waren alle RPCs unter /rest/v1/rpc auch
-- ohne Login aufrufbar. Die meisten liefern ohne auth.uid() nichts,
-- aber record_card_price (Preisverlauf fälschen), card_value_history
-- und find_user_by_email (E-Mail-Enumeration) wirkten auch anonym.
-- Alle Aufrufer in der App sind eingeloggt; der nächtliche Cron
-- (app/api/cron/prices) nutzt service_role und ruft keine RPCs auf.
-- ============================================================

revoke execute on function public.accept_trade(uuid) from public, anon;
grant execute on function public.accept_trade(uuid) to authenticated;

revoke execute on function public.card_value_history(uuid) from public, anon;
grant execute on function public.card_value_history(uuid) to authenticated;

revoke execute on function public.collections_shared_with_me() from public, anon;
grant execute on function public.collections_shared_with_me() to authenticated;

revoke execute on function public.decline_trade(uuid) from public, anon;
grant execute on function public.decline_trade(uuid) to authenticated;

revoke execute on function public.find_user_by_email(text) from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;

revoke execute on function public.friends_owning_card(text) from public, anon;
grant execute on function public.friends_owning_card(text) to authenticated;

revoke execute on function public.friends_wanting_card(text) from public, anon;
grant execute on function public.friends_wanting_card(text) to authenticated;

revoke execute on function public.my_friendships() from public, anon;
grant execute on function public.my_friendships() to authenticated;

revoke execute on function public.my_loans() from public, anon;
grant execute on function public.my_loans() to authenticated;

revoke execute on function public.my_trades() from public, anon;
grant execute on function public.my_trades() to authenticated;

revoke execute on function public.record_card_price(uuid, numeric, numeric) from public, anon;
grant execute on function public.record_card_price(uuid, numeric, numeric) to authenticated;

revoke execute on function public.shared_collection(uuid) from public, anon;
grant execute on function public.shared_collection(uuid) to authenticated;

revoke execute on function public.snapshot_collection_value() from public, anon;
grant execute on function public.snapshot_collection_value() to authenticated;

revoke execute on function public.snapshot_deck_value(uuid) from public, anon;
grant execute on function public.snapshot_deck_value(uuid) to authenticated;

-- Künftige Funktionen (von postgres angelegt) standardmäßig nicht mehr
-- für PUBLIC/anon. authenticated und service_role behalten EXECUTE über
-- die bestehenden Supabase-Default-Privileges für das Schema public.
-- Der PUBLIC-Default ist in Postgres global und lässt sich nicht je
-- Schema entziehen, daher ohne "in schema".
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
