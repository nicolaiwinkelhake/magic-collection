import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectAll } from "@/lib/supabase/selectAll";
import { notify } from "@/lib/push";
import { messages, nameOf } from "@/lib/pushMessages";
import { diffWishlistMatches, priceMovers, type DayPrices, type OwnedCard, type WishMatch, type WishSent } from "@/lib/alerts";

export const maxDuration = 120;

const IN_CHUNK = 200;

// Tägliche Mitteilungen am Morgen (nach dem nächtlichen Preisabgleich):
// 1) neue Wunschlisten-Treffer in geteilten Sammlungen von Freunden
// 2) starke Preisbewegungen in der eigenen Sammlung seit gestern
// Nur für Nutzer mit mindestens einem angemeldeten Gerät. Geschützt durch
// das Cron-Secret (Vercel sendet "Authorization: Bearer $CRON_SECRET").
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const summary = { wishlistUsers: 0, wishlistHits: 0, priceUsers: 0, sent: 0, errors: [] as string[] };

  // Wunschliste: Treffer immer abgleichen (auch ohne Gerät), damit später
  // angemeldete Geräte nicht alte Treffer als neu gemeldet bekommen.
  try {
    const { data: matches, error } = await supabase.rpc("wishlist_friend_matches");
    if (error) throw new Error(error.message);
    const sent = await selectAll<WishSent>(() =>
      supabase.from("wishlist_alerts").select("user_id, owner_id, card_name").order("user_id").order("owner_id").order("card_name"),
    );
    const { byUser, remember, forget } = diffWishlistMatches((matches ?? []) as WishMatch[], sent);
    for (const [userId, hits] of byUser) {
      summary.wishlistUsers++;
      summary.wishlistHits += hits.length;
      summary.sent += await notify([userId], messages.wishlistAvailable(hits.map((h) => ({ card: h.card_name, owner: nameOf(h.owner_email) }))));
    }
    for (let i = 0; i < remember.length; i += 500) {
      const { error: e } = await supabase.from("wishlist_alerts").upsert(remember.slice(i, i + 500), { onConflict: "user_id,owner_id,card_name" });
      if (e) throw new Error(e.message);
    }
    for (const f of forget) {
      await supabase.from("wishlist_alerts").delete().eq("user_id", f.user_id).eq("owner_id", f.owner_id).eq("card_name", f.card_name);
    }
  } catch (e) {
    summary.errors.push(`Wunschliste: ${e instanceof Error ? e.message : e}`);
  }

  // Preise: nur Nutzer mit Gerät und eingeschalteten Preis-Mitteilungen
  try {
    const { data: subs } = await supabase.from("push_subscriptions").select("user_id");
    const { data: off } = await supabase.from("notification_prefs").select("user_id").eq("prices", false);
    const offSet = new Set((off ?? []).map((r) => r.user_id as string));
    const users = Array.from(new Set((subs ?? []).map((s) => s.user_id as string))).filter((u) => !offSet.has(u));
    if (users.length) {
      const cards = await selectAll<OwnedCard & { id: string }>(() =>
        supabase.from("cards").select("id, user_id, scryfall_id, name, quantity, foil, condition").in("user_id", users).order("id"),
      );
      const ids = Array.from(new Set(cards.map((c) => c.scryfall_id).filter((x): x is string => !!x)));
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const day: Record<string, DayPrices> = { [today]: new Map(), [yesterday]: new Map() };
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const rows = await selectAll<{ scryfall_id: string; captured_on: string; price_eur: number | null; price_eur_foil: number | null }>(() =>
          supabase
            .from("card_price_history")
            .select("scryfall_id, captured_on, price_eur, price_eur_foil")
            .in("scryfall_id", ids.slice(i, i + IN_CHUNK))
            .in("captured_on", [today, yesterday])
            .order("scryfall_id")
            .order("captured_on"),
        );
        for (const r of rows) day[r.captured_on]?.set(r.scryfall_id, { eur: r.price_eur, eurFoil: r.price_eur_foil });
      }
      if (!day[today].size) throw new Error("Für heute gibt es noch keine Preise (Preisabgleich gelaufen?)");
      for (const [userId, { total, movers, alert }] of priceMovers(cards, day[today], day[yesterday])) {
        if (!alert || !movers.length) continue;
        summary.priceUsers++;
        summary.sent += await notify([userId], messages.priceMoves(total, movers));
      }
    }
  } catch (e) {
    summary.errors.push(`Preise: ${e instanceof Error ? e.message : e}`);
  }

  console.log("Mitteilungs-Cron fertig", summary);
  return NextResponse.json(summary, { status: summary.errors.length ? 500 : 200 });
}
