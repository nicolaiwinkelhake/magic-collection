import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, messages, nameOf, PUSH_KINDS, wantsKind } from "@/lib/pushMessages";
import { keyToBytes } from "@/lib/pushClient";
import { hapticPattern } from "@/lib/haptics";
import { chimeNotes } from "@/lib/sounds";

describe("Push-Mitteilungen", () => {
  it("Texte für Trade-Anfragen je nach Richtung", () => {
    expect(messages.tradeRequest("nils", 2, 1).body).toBe("nils bietet 2 Karten und möchte 1 Karte von dir.");
    expect(messages.tradeRequest("nils", 0, 3).body).toBe("nils möchte 3 Karten von dir.");
    expect(messages.tradeRequest("nils", 1, 0).body).toBe("nils bietet dir 1 Karte an.");
    expect(messages.tradeRequest("nils", 1, 0).url).toBe("/trades");
  });

  it("Name aus der E-Mail", () => {
    expect(nameOf("rene.k@example.org")).toBe("rene.k");
    expect(nameOf(undefined)).toBe("Jemand");
  });

  it("Einstellungen: ohne Eintrag alles an, sonst je Art", () => {
    expect(wantsKind(null, "trades")).toBe(true);
    expect(wantsKind({ ...DEFAULT_PREFS, trades: false }, "trades")).toBe(false);
    expect(wantsKind({ ...DEFAULT_PREFS, trades: false }, "friends")).toBe(true);
    expect(PUSH_KINDS.map((k) => k.kind).sort()).toEqual(Object.keys(DEFAULT_PREFS).sort());
  });

  it("jede Mitteilung hat Art, Titel und Ziel", () => {
    for (const m of [messages.tradeAccepted("a"), messages.tradeDeclined("a"), messages.friendRequest("a"), messages.friendAccepted("a"), messages.shared("a"), messages.loan("a", "Sol Ring"), messages.test()]) {
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.url.startsWith("/")).toBe(true);
      expect(wantsKind(DEFAULT_PREFS, m.kind)).toBe(true);
    }
  });

  it("VAPID-Schlüssel wird in Bytes umgewandelt", () => {
    expect(Array.from(keyToBytes("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
  });
});

describe("Vibration und Töne", () => {
  it("Muster je Art", () => {
    expect(hapticPattern("tap")).toEqual({ vibrate: [15], ticks: 1 });
    expect(hapticPattern("error").ticks).toBe(3);
  });

  it("jede Mitteilungsart hat eine eigene Melodie", () => {
    const tunes = PUSH_KINDS.map((k) => JSON.stringify(chimeNotes(k.kind)));
    expect(new Set(tunes).size).toBe(PUSH_KINDS.length);
    for (const k of PUSH_KINDS) expect(chimeNotes(k.kind).every((n) => n.f > 100 && n.len > 0)).toBe(true);
  });
});
