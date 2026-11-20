import { describe, expect, it } from "vitest";
import { filterByFriend, friendCounts, friendLabel } from "@/lib/wishlistFilter";

const items = [{ name: "Sol Ring" }, { name: "Cultivate" }, { name: "Doubling Season" }, { name: "Counterspell" }];
const ownership = {
  "Sol Ring": ["nils@web.de", "rene@web.de"],
  Cultivate: ["nils@web.de"],
  "Doubling Season": ["rene@web.de", "rene@web.de"],
};

describe("Wunschliste: Freundefilter", () => {
  it("ohne Filter bleibt alles", () => {
    expect(filterByFriend(items, ownership, null)).toBe(items);
  });
  it("„irgendein Freund“ zeigt nur Karten mit mindestens einem Besitzer", () => {
    expect(filterByFriend(items, ownership, "any").map((i) => i.name)).toEqual(["Sol Ring", "Cultivate", "Doubling Season"]);
  });
  it("ein bestimmter Freund", () => {
    expect(filterByFriend(items, ownership, "nils@web.de").map((i) => i.name)).toEqual(["Sol Ring", "Cultivate"]);
    expect(filterByFriend(items, ownership, "rene@web.de").map((i) => i.name)).toEqual(["Sol Ring", "Doubling Season"]);
    expect(filterByFriend(items, ownership, "unbekannt@web.de")).toEqual([]);
  });
  it("zählt Karten je Freund (doppelte Einträge zählen einmal), größte Zahl zuerst", () => {
    const c = friendCounts(items, ownership);
    expect(c.any).toBe(3);
    expect(c.friends).toEqual([
      { email: "nils@web.de", label: "nils", count: 2 },
      { email: "rene@web.de", label: "rene", count: 2 },
    ]);
  });
  it("leere Liste und leere Besitzer", () => {
    expect(friendCounts([], ownership)).toEqual({ any: 0, friends: [] });
    expect(filterByFriend(items, {}, "any")).toEqual([]);
  });
  it("Anzeigename", () => {
    expect(friendLabel("nils@web.de")).toBe("nils");
  });
});
