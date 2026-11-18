import { describe, expect, it } from "vitest";
import { folderNotice } from "@/components/ui/FolderPicker";

describe("folderNotice", () => {
  it("nennt Anzahl und Ordner", () => {
    expect(folderNotice(8, "Für Burn", true)).toBe("8 Karten zu „Für Burn“ hinzugefügt");
    expect(folderNotice(1, "Für Burn", true)).toBe("1 Karte zu „Für Burn“ hinzugefügt");
    expect(folderNotice(3, "Trade-Binder", false)).toBe("3 Karten aus „Trade-Binder“ entfernt");
  });
});
