import { describe, expect, it } from "vitest";
import { prune, toggle, toggleAll } from "@/lib/selection";

describe("selection", () => {
  it("umschalten", () => {
    let s = toggle(new Set(), "a");
    expect([...s]).toEqual(["a"]);
    s = toggle(s, "a");
    expect(s.size).toBe(0);
  });
  it("alle / keine", () => {
    expect([...toggleAll(new Set(["a"]), ["a", "b"])].sort()).toEqual(["a", "b"]);
    expect(toggleAll(new Set(["a", "b"]), ["a", "b"]).size).toBe(0);
    expect(toggleAll(new Set(), []).size).toBe(0);
  });
  it("verwirft verschwundene Einträge, sonst gleiche Menge", () => {
    const s = new Set(["a", "b"]);
    expect([...prune(s, ["b", "c"])]).toEqual(["b"]);
    expect(prune(s, ["a", "b", "c"])).toBe(s);
  });
});

import { withCount } from "@/components/ui/SelectionBar";

describe("withCount", () => {
  it("Einzahl und Mehrzahl", () => {
    expect(withCount("{n} Karten entfernen?", 1)).toBe("1 Karte entfernen?");
    expect(withCount("{n} Karten entfernen?", 3)).toBe("3 Karten entfernen?");
    expect(withCount("{n} Einträge entfernen?", 1)).toBe("1 Eintrag entfernen?");
  });
});
