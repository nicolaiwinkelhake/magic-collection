import { afterEach, describe, expect, it, vi } from "vitest";
import { COLLECTION_PACE_MS, fetchCollectionWithRetry, retryAfterMs } from "@/lib/scryfall";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Scryfall-Tempo", () => {
  it("hält höchstens ~2 Abfragen pro Sekunde ein", () => {
    expect(COLLECTION_PACE_MS).toBeGreaterThanOrEqual(500);
  });

  it("wartet nach 429 so lange wie Retry-After verlangt (begrenzt)", () => {
    expect(retryAfterMs("59", 0)).toBe(59_250);
    expect(retryAfterMs("600", 0)).toBe(65_250);
    expect(retryAfterMs(null, 1)).toBe(4000);
  });

  it("wiederholt nach 429 und liefert dann die Karten", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "x" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = fetchCollectionWithRetry([{ id: "x" }]);
    await vi.advanceTimersByTimeAsync(2_250);
    await expect(p).resolves.toEqual([{ id: "x" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gibt bei fehlerhafter Anfrage (400) sofort auf", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchCollectionWithRetry([{ id: "x" }])).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
