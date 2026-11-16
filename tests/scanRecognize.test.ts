import { describe, expect, it } from "vitest";
import { buildNameIndex } from "@/lib/nameIndex";
import { lateStarts } from "@/lib/ocr";

// judge importiert Browser-Module nur über Typen/Funktionen, die hier nicht laufen
import { judge } from "@/lib/scanRecognize";

const dict = buildNameIndex(["Remedy", "Tainted Remedy", "Lightning Bolt", "Shock", "Sparktongue Dragon", "Siege Dragon"]);

describe("judge – wann ist ein gelesener Name sofort sicher?", () => {
  it("bestätigt eine saubere Lesung", () => {
    expect(judge(["Lightning Bolt"], dict).sure?.name).toBe("Lightning Bolt");
    expect(judge(["Shock"], dict).sure?.name).toBe("Shock");
  });
  it("nicht, wenn die Lesung zu weit rechts beginnt (Anfang fehlt)", () => {
    const late = lateStarts([{ text: "Remedy", confidence: 90, x0: 0.31 }]);
    expect(judge(["Remedy"], dict, late).sure).toBeNull();
    expect(judge(["Remedy"], dict, lateStarts([{ text: "Remedy", confidence: 90, x0: 0.05 }])).sure?.name).toBe("Remedy");
  });
  it("nicht, wenn eine andere Lesart auf einen längeren Namen deutet", () => {
    const r = judge(["Tainted Remedy EL", "Remedy"], dict);
    expect(r.sure?.name ?? null).not.toBe("Remedy");
    expect(r.corrected).toContain("Tainted Remedy");
  });
  it("unsichere Lesung bleibt unsicher, liefert aber Vorschläge", () => {
    const r = judge(["EEE Dragon"], dict);
    expect(r.sure).toBeNull();
  });
});

describe("deutsche Karten", () => {
  it("ein deutscher Name passt zu keinem englischen – Auslöser für das deutsche Modell", async () => {
    const { bestGuess } = await import("@/lib/scanRecognize");
    expect(bestGuess(judge(["Blitzschlag"], dict), dict)).toBeNull();
    expect(bestGuess(judge(["Lightnmg Bolt"], dict), dict)?.name).toBe("Lightning Bolt");
  });
});
