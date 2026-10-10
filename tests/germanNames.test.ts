import { describe, it, expect } from "vitest";
import { buildGermanQuery, germanNameFromCard } from "@/lib/germanNames";

describe("buildGermanQuery", () => {
  it("verknüpft exakte Namen per ODER und filtert auf Deutsch", () => {
    expect(buildGermanQuery(["Sol Ring", "Fire // Ice"])).toBe('lang:de (!"Sol Ring" or !"Fire // Ice")');
  });

  it("maskiert Anführungszeichen im Namen", () => {
    expect(buildGermanQuery(['Kongming, "Sleeping Dragon"'])).toBe('lang:de (!"Kongming, \\"Sleeping Dragon\\"")');
  });
});

describe("germanNameFromCard", () => {
  it("liest printed_name", () => {
    expect(germanNameFromCard({ name: "Lightning Bolt", printed_name: "Blitzschlag" })).toBe("Blitzschlag");
  });

  it("ignoriert printed_name, der dem englischen Namen entspricht", () => {
    expect(germanNameFromCard({ name: "Sol Ring", printed_name: "Sol Ring" })).toBeNull();
  });

  it("setzt doppelseitige Karten aus den Seiten zusammen", () => {
    expect(
      germanNameFromCard({
        name: "Delver of Secrets // Insectile Aberration",
        card_faces: [
          { name: "Delver of Secrets", printed_name: "Geheimnissucher" },
          { name: "Insectile Aberration", printed_name: "Insektoide Abart" },
        ],
      })
    ).toBe("Geheimnissucher // Insektoide Abart");
  });

  it("übernimmt nichts, wenn eine Seite nicht übersetzt ist", () => {
    expect(
      germanNameFromCard({
        name: "Emeritus of Conflict // Lightning Bolt",
        card_faces: [
          { name: "Emeritus of Conflict", printed_name: "Emerita des Konflikts" },
          { name: "Lightning Bolt" },
        ],
      })
    ).toBeNull();
  });
});
