// Erkennung bekannter Zwei-Karten-Combos für den Commander-Bracket-Rechner.
// Bewusst als kuratierte Liste der berüchtigtsten Kombinationen umgesetzt –
// nicht erschöpfend. Ein vollständiger Abgleich wäre später über die
// Commander-Spellbook-Datenbank möglich (Datennutzung vorher klären).

export type ComboPair = { a: string; b: string };

export const KNOWN_COMBOS: ComboPair[] = [
  { a: "Thassa's Oracle", b: "Demonic Consultation" },
  { a: "Thassa's Oracle", b: "Tainted Pact" },
  { a: "Jace, Wielder of Mysteries", b: "Demonic Consultation" },
  { a: "Isochron Scepter", b: "Dramatic Reversal" },
  { a: "Exquisite Blood", b: "Sanguine Bond" },
  { a: "Mikaeus, the Unhallowed", b: "Triskelion" },
  { a: "Heliod, Sun-Crowned", b: "Walking Ballista" },
  { a: "Kiki-Jiki, Mirror Breaker", b: "Zealous Conscripts" },
  { a: "Kiki-Jiki, Mirror Breaker", b: "Deceiver Exarch" },
  { a: "Splinter Twin", b: "Deceiver Exarch" },
  { a: "Worldgorger Dragon", b: "Animate Dead" },
  { a: "Godo, Bandit Warlord", b: "Helm of the Host" },
  { a: "Basalt Monolith", b: "Rings of Brighthearth" },
  { a: "Grand Architect", b: "Pili-Pala" },
  { a: "Devoted Druid", b: "Vizier of Remedies" },
  { a: "Rest in Peace", b: "Helm of Obedience" },
  { a: "Painter's Servant", b: "Grindstone" },
  { a: "Time Sieve", b: "Thopter Assembly" },
  { a: "Peregrine Drake", b: "Deadeye Navigator" },
  { a: "Karmic Guide", b: "Reveillark" },
];

// Findet alle bekannten Combos, deren BEIDE Teile im Deck sind.
export function detectCombos(cardNames: string[]): ComboPair[] {
  const inDeck = new Set(cardNames.map((n) => n.toLowerCase()));
  return KNOWN_COMBOS.filter(
    (p) => inDeck.has(p.a.toLowerCase()) && inDeck.has(p.b.toLowerCase())
  );
}

export function formatCombo(p: ComboPair): string {
  return `${p.a} + ${p.b}`;
}
