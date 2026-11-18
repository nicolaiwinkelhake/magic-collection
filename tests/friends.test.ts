import { describe, expect, it } from "vitest";
import { openRequests, uniqueFriends } from "@/lib/friends";

const row = (id: string, other: string, status: string, direction: string, created_at: string) => ({
  id, other_user_id: other, other_user_email: other + "@example.de", status, direction, created_at,
});

describe("Freunde", () => {
  const rows = [
    row("1", "a", "accepted", "outgoing", "2026-07-05T07:45:00Z"),
    row("2", "a", "accepted", "incoming", "2026-07-05T09:16:00Z"),
    row("3", "b", "accepted", "incoming", "2026-07-08T15:33:49Z"),
    row("4", "b", "accepted", "outgoing", "2026-07-08T15:33:54Z"),
    row("5", "c", "pending", "incoming", "2026-08-01T00:00:00Z"),
    row("6", "a", "pending", "outgoing", "2026-08-01T00:00:00Z"),
  ];
  it("zeigt jede Person nur einmal", () => {
    expect(uniqueFriends(rows).map((r) => r.id)).toEqual(["1", "3"]);
  });
  it("offene Anfragen ohne bestehende Freunde", () => {
    expect(openRequests(rows, "incoming").map((r) => r.id)).toEqual(["5"]);
    expect(openRequests(rows, "outgoing")).toEqual([]);
  });
});
