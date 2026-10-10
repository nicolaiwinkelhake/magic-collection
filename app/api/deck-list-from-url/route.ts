import { requireUser, unauthorized } from "@/lib/apiAuth";
import { cardListFromUrl } from "@/lib/commanderSpellbook";

// GET /api/deck-list-from-url?url=https://moxfield.com/decks/...
// Antwort: { commanders: string[], text: "1 Sol Ring\n…" } (Format des Textimports)
export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) return unauthorized();

  const raw = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return Response.json({ error: "Ungültiger Link" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(url.protocol)) return Response.json({ error: "Ungültiger Link" }, { status: 400 });

  const list = await cardListFromUrl(url.toString());
  if (!list || (!list.main.length && !list.commanders.length)) {
    return Response.json(
      { error: "Deckliste konnte nicht gelesen werden (Deck öffentlich? Unterstützt u. a. Moxfield, Archidekt, TappedOut)." },
      { status: 422 }
    );
  }
  return Response.json({
    commanders: list.commanders.map((c) => c.card),
    text: list.main.map((c) => `${c.quantity} ${c.card}`).join("\n"),
  });
}
