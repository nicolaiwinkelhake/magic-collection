// Deckliste als Text im verbreiteten Format ("1 Sol Ring"), mit Commander-
// Abschnitt – lässt sich in Moxfield, Archidekt & Co. einfügen (rein, getestet).

export function deckToText(cards: Array<{ name: string; is_commander: boolean }>): string {
  const count = (list: typeof cards) => {
    const m = new Map<string, number>();
    for (const c of list) m.set(c.name, (m.get(c.name) ?? 0) + 1);
    return Array.from(m, ([name, n]) => `${n} ${name}`).sort((a, b) => a.replace(/^\d+ /, "").localeCompare(b.replace(/^\d+ /, "")));
  };
  const commanders = count(cards.filter((c) => c.is_commander));
  const main = count(cards.filter((c) => !c.is_commander));
  return [...(commanders.length ? ["Commander", ...commanders, ""] : []), "Deck", ...main].join("\n") + "\n";
}
