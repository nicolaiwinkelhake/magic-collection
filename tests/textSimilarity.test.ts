import { describe, expect, it } from "vitest";
import { bestNameMatch, nameSimilarity, normalizeName } from "@/lib/textSimilarity";

describe("textSimilarity", () => {
  it("normalisiert Umlaute, ß, Satzzeichen", () => {
    expect(normalizeName("Aufstieg der Saurier, ß!")).toBe("aufstiegdersaurierss");
    expect(normalizeName("Éowyn")).toBe("eowyn");
  });

  it("toleriert typische Lesefehler", () => {
    expect(nameSimilarity("Blitzschlag", "Blitzschlag")).toBe(1);
    expect(nameSimilarity("Blitzsch1ag", "Blitzschlag")).toBeGreaterThan(0.85);
    expect(nameSimilarity("Gegenzauber", "Blitzschlag")).toBeLessThan(0.5);
  });

  it("bestNameMatch wählt den ähnlichsten über der Schwelle, auch Vorderseite", () => {
    const items = [{ n: "Gegenzauber" }, { n: "Blitzschlag" }, { n: "Delver der Geheimnisse // Insektoider Albtraum" }];
    expect(bestNameMatch("B1itzschlag", items, (i) => i.n)?.item.n).toBe("Blitzschlag");
    expect(bestNameMatch("Delver der Geheimnise", items, (i) => i.n)?.item.n).toContain("Delver");
    expect(bestNameMatch("Sonnenring", items, (i) => i.n)).toBeNull();
  });
});
