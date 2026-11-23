import { describe, expect, it } from "vitest";
import { printInfo, rememberAttempt, type Attempt } from "@/lib/scanReports";

describe("Scan-Meldungen", () => {
  it("beschreibt einen Druck knapp", () => {
    expect(printInfo({ id: "x", name: "Sol Ring", set: "trc", collectorNumber: "499" })).toEqual({ id: "x", name: "Sol Ring", set: "trc", number: "499" });
    expect(printInfo(null)).toBeNull();
  });
  it("merkt höchstens N Versuche, die ältesten fallen raus, erneutes Merken zählt als neu", () => {
    const store = new Map<string, Attempt>();
    const a = (n: string): Attempt => ({ image: n, read: { names: [n], info: null } });
    for (const k of ["a", "b", "c"]) rememberAttempt(store, k, a(k), 2);
    expect(Array.from(store.keys())).toEqual(["b", "c"]);
    rememberAttempt(store, "b", a("b2"), 2);
    rememberAttempt(store, "d", a("d"), 2);
    expect(Array.from(store.keys())).toEqual(["b", "d"]);
    expect(store.get("b")!.image).toBe("b2");
  });
});
