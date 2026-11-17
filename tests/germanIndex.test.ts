import { describe, expect, it } from "vitest";
import { buildGermanIndex, englishFor } from "@/lib/germanIndex";
import { matchName } from "@/lib/nameIndex";

describe("deutsches Wörterbuch", () => {
  const de = buildGermanIndex([
    ["Blitzschlag", "Lightning Bolt"],
    ["Schildkrötenformation", "Tortoise Formation"],
    ["Zweideutig", "Card A"],
    ["Zweideutig", "Card B"],
    ["Blitzschlag", "Lightning Bolt"],
  ]);
  it("findet deutsche Namen auch ohne Umlaute und mit Lesefehlern", () => {
    expect(matchName(de.index, "Schildkrotenformation")).toMatchObject({ name: "Schildkrötenformation", confident: true });
    expect(matchName(de.index, "Blitzschiag")?.name).toBe("Blitzschlag");
  });
  it("liefert den englischen Namen nur, wenn er eindeutig ist", () => {
    expect(englishFor(de, "Blitzschlag")).toBe("Lightning Bolt");
    expect(englishFor(de, "Zweideutig")).toBeNull();
    expect(englishFor(de, "Unbekannt")).toBeNull();
  });
});
