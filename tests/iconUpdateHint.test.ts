import { describe, expect, it } from "vitest";
import { shouldShowIconHint } from "@/components/IconUpdateHint";

const base = { standalone: true, ios: true, storedKeys: 5, done: false, later: false };

describe("shouldShowIconHint", () => {
  it("zeigt den Hinweis in der installierten iPhone-App mit altem Stand", () => {
    expect(shouldShowIconHint(base)).toBe(true);
  });
  it("nicht im normalen Browser oder auf Android", () => {
    expect(shouldShowIconHint({ ...base, standalone: false })).toBe(false);
    expect(shouldShowIconHint({ ...base, ios: false })).toBe(false);
  });
  it("nicht nach „Erledigt“ oder „Später“ in dieser Sitzung", () => {
    expect(shouldShowIconHint({ ...base, done: true })).toBe(false);
    expect(shouldShowIconHint({ ...base, later: true })).toBe(false);
  });
  it("nicht in einer frisch hinzugefügten App (hat das neue Symbol schon)", () => {
    expect(shouldShowIconHint({ ...base, storedKeys: 0 })).toBe(false);
  });
});
