import { describe, expect, it } from "vitest";
import { RELEASES, shouldShowRelease } from "@/lib/releaseNotes";

describe("Neuigkeiten", () => {
  it("zeigt das Fenster nur bei ungesehenen Neuigkeiten", () => {
    const latest = { id: "2026-11-18", date: "2026-11-18", title: "x", items: [] };
    expect(shouldShowRelease(null, latest)).toBe(true);
    expect(shouldShowRelease("2026-11-01", latest)).toBe(true);
    expect(shouldShowRelease("2026-11-18", latest)).toBe(false);
    expect(shouldShowRelease("2026-11-18b", latest)).toBe(false);
  });
  it("Einträge sind neuester zuerst und eindeutig", () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort().reverse()).toEqual(ids);
    for (const r of RELEASES) expect(r.items.length).toBeGreaterThan(0);
  });
});
