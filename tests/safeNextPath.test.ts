import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safeNextPath";

describe("safeNextPath", () => {
  it("lässt interne Pfade durch", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
  });
  it("blockt externe Ziele", () => {
    expect(safeNextPath("https://evil.com")).toBe("/collection");
    expect(safeNextPath("//evil.com")).toBe("/collection");
    expect(safeNextPath("/\\evil.com")).toBe("/collection");
  });
  it("nutzt Standard ohne Angabe", () => {
    expect(safeNextPath(null)).toBe("/collection");
  });
});
