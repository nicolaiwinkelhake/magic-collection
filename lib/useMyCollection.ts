"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { selectAll } from "@/lib/supabase/selectAll";
import { buildOwnIndex, type OwnIndex, type OwnRow } from "@/lib/ownedMatch";

export type MyDecks = { cards: Array<{ deck_id: string; name: string }>; decks: Array<{ id: string; name: string }> };

/**
 * Eigene Sammlung + Decks einmal laden (per RLS nur die eigenen), um bei
 * Karten von Freunden zu zeigen: "Hast du schon" / "In deinen Decks".
 */
export function useMyCollection(): { own: OwnIndex | null; myDecks: MyDecks | null } {
  const supabase = useMemo(() => createClient(), []);
  const [own, setOwn] = useState<OwnIndex | null>(null);
  const [myDecks, setMyDecks] = useState<MyDecks | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const uid = auth.user.id;
      const [rows, deckRows, { data: deckList }] = await Promise.all([
        selectAll<OwnRow>(() => supabase.from("cards").select("name, scryfall_id, quantity").eq("user_id", uid).order("id")).catch(() => null),
        selectAll<{ deck_id: string; name: string }>(() =>
          supabase.from("deck_cards").select("deck_id, name").eq("user_id", uid).order("id"),
        ).catch(() => []),
        supabase.from("decks").select("id, name").eq("user_id", uid),
      ]);
      if (cancelled) return;
      if (rows) setOwn(buildOwnIndex(rows));
      setMyDecks({ cards: deckRows, decks: deckList ?? [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);
  return { own, myDecks };
}
