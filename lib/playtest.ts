// Reine Playtester-/Goldfishing-Logik – ohne UI, damit gut testbar.
// Modelliert: Bibliothek aus Deckkarten aufbauen, mischen (seedbar für Tests),
// Starthand ziehen, London-Mulligan (ziehen 7, dann n Karten unten anlegen)
// und einzelne Karten nachziehen.

export type PlaytestCard = {
  id: string;
  name: string;
  image_url: string | null;
  type_line: string | null;
  is_commander: boolean;
};

// Deterministischer PRNG (mulberry32) – erlaubt reproduzierbares Mischen in Tests.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Baut die Bibliothek: Commander bleibt außen vor (Command Zone), der Rest
// bildet das 99-/60-Karten-Deck.
export function buildLibrary(cards: PlaytestCard[]): PlaytestCard[] {
  return cards.filter((c) => !c.is_commander);
}

// Fisher-Yates-Shuffle mit optionalem RNG (Standard: Math.random).
export function shuffle<T>(input: T[], rng: () => number = Math.random): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export type GameState = {
  library: PlaytestCard[];
  hand: PlaytestCard[];
  mulligans: number;
};

export function newGame(
  cards: PlaytestCard[],
  rng: () => number = Math.random,
  handSize = 7
): GameState {
  const library = shuffle(buildLibrary(cards), rng);
  const hand = library.slice(0, handSize);
  return { library: library.slice(handSize), hand, mulligans: 0 };
}

// London-Mulligan: gesamte Hand zurück, neu mischen, wieder 7 ziehen. Nach dem
// Behalten müssen so viele Karten unter die Bibliothek gelegt werden wie
// Mulligans genommen wurden (hier vereinfacht: Anzahl wird zurückgegeben,
// die konkrete Auswahl trifft der Spieler in der UI).
export function mulligan(
  full: PlaytestCard[],
  prev: GameState,
  rng: () => number = Math.random,
  handSize = 7
): GameState {
  const library = shuffle(buildLibrary(full), rng);
  const hand = library.slice(0, handSize);
  return {
    library: library.slice(handSize),
    hand,
    mulligans: prev.mulligans + 1,
  };
}

// Eine Karte von oben nachziehen. Gibt neuen State + gezogene Karte (oder null).
export function draw(state: GameState): {
  state: GameState;
  card: PlaytestCard | null;
} {
  if (state.library.length === 0) return { state, card: null };
  const [card, ...rest] = state.library;
  return {
    state: { ...state, library: rest, hand: [...state.hand, card] },
    card,
  };
}

// Anzahl Länder in einer Kartenliste (für die Starthand-Einschätzung).
export function countLands(cards: PlaytestCard[]): number {
  return cards.filter((c) => c.type_line?.toLowerCase().includes("land")).length;
}
