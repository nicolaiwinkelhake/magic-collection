"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type GeneratedCard = {
  name: string;
  quantity: number;
  category: string;
  type_line: string | null;
  cmc: number | null;
  colors: string[] | null;
};

type Combo = {
  cards: string[];
  produces: string[];
  description: string;
  popularity: number;
};

type AlmostCombo = Combo & { missing: string[] };

type AlternativeCommander = {
  name: string;
  imageUrl: string | null;
  reasoning: string;
};

type GenerateResult = {
  commander: { name: string; imageUrl: string | null; colorIdentity: string[] };
  deckName: string;
  strategy: string;
  targetBracket: number;
  bracketJustification: string;
  bracketCheck: {
    bracket: number;
    label: string;
    gameChangers: string[];
    reasons: string[];
  } | null;
  improvementAdvice: string;
  alternativeCommanders: AlternativeCommander[];
  cards: GeneratedCard[];
  totalCount: number;
  combos: { included: Combo[]; almostIncluded: AlmostCombo[] } | null;
};

type CommanderOption = {
  name: string;
  imageUrl: string | null;
  colors: string[];
  hasDeck: boolean;
};

const CATEGORY_ORDER = ["Land", "Ramp", "Removal", "Kartenvorteil", "Wincon", "Synergie", "Sonstiges"];

const BRACKETS: { value: number; label: string; description: string }[] = [
  {
    value: 2,
    label: "2 · Core",
    description: "Precon-Niveau: keine Game Changer, keine 2-Karten-Combos. Gemütliche Runden (8+ Züge).",
  },
  {
    value: 3,
    label: "3 · Upgraded",
    description: "Getunt: bis zu 3 Game Changer, Combos erst ab Zug 6. Der Sweet Spot der meisten Runden.",
  },
  {
    value: 4,
    label: "4 · Optimized",
    description: "High Power: alles erlaubt - Fast Mana, Tutoren, frühe Combos. Spiele enden ab Zug 4.",
  },
  {
    value: 5,
    label: "5 · cEDH",
    description: "Kompetitiv: maximale Konsistenz, so schnell wie möglich gewinnen. Themen egal.",
  },
];

// Der Server sendet während der Generierung alle paar Sekunden ein
// Lebenszeichen - länger als 90s Funkstille heißt: Verbindung/Function tot.
const IDLE_TIMEOUT_MS = 90_000;

function describeError(e: unknown, fallback: string): string {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return "Keine Antwort vom Server (90s ohne Lebenszeichen) - bitte nochmal versuchen.";
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

export function AIDeckGeneratorClient() {
  const router = useRouter();
  const [bracket, setBracket] = useState(3);
  const [commanderName, setCommanderName] = useState("");
  const [showCommanderPicker, setShowCommanderPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [alternatives, setAlternatives] = useState<AlternativeCommander[]>([]);
  const [creating, setCreating] = useState(false);
  const [commanderOptions, setCommanderOptions] = useState<CommanderOption[] | null>(null);
  const [loadingCommanders, setLoadingCommanders] = useState(true);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Sichtbarer Sekundenzähler, damit klar ist, dass noch etwas passiert
  // (eine komplette Generierung kann mehrere Minuten dauern).
  useEffect(() => {
    if (!loading) return;
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  // Liest eine NDJSON-Stream-Antwort (ein JSON-Objekt pro Zeile). Bricht nicht
  // nach fester Gesamtzeit ab, sondern nur wenn IDLE_TIMEOUT_MS lang gar keine
  // Daten mehr ankommen - der Server streamt laufend Status-Lebenszeichen.
  async function streamNdjson(
    url: string,
    options: RequestInit,
    onEvent: (event: { type: string; [key: string]: unknown }) => void
  ): Promise<Record<string, unknown> | null> {
    const controller = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => controller.abort(new DOMException("Keine Daten mehr empfangen", "TimeoutError")),
        IDLE_TIMEOUT_MS
      );
    };
    resetIdle();

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Fehler (Status ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: Record<string, unknown> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdle();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          onEvent(event);
          if (event.type === "error") throw new Error(event.error ?? "Unbekannter Fehler");
          if (event.type === "result") result = event;
        }
      }

      if (!result) throw new Error("Antwort unvollständig - bitte nochmal versuchen.");
      return result;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
    }
  }

  useEffect(() => {
    fetch("/api/ai-deck-generator/commanders")
      .then((r) => r.json())
      .then((d) => setCommanderOptions(d.commanders ?? []))
      .finally(() => setLoadingCommanders(false));
  }, []);

  // Die Generierung läuft in zwei getrennten Requests (Commander-Wahl, dann
  // Deckbau), damit jeder einzelne unter Vercels Zeitlimit bleibt. Ist ein
  // Commander vorgegeben, wird Phase 1 übersprungen.
  async function handleGenerate(overrideCommander?: string) {
    let chosenCommander = (overrideCommander ?? commanderName).trim();
    setLoading(true);
    setError(null);
    setResult(null);
    setGenerateStatus("Starte Generierung...");
    const onEvent = (event: { type: string; [key: string]: unknown }) => {
      if (event.type === "status") setGenerateStatus(event.message as string);
    };
    const post = (body: Record<string, unknown>) =>
      streamNdjson(
        "/api/ai-deck-generator",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        onEvent
      );

    try {
      let alts = overrideCommander
        ? alternatives.filter((a) => a.name !== overrideCommander)
        : [];
      if (!chosenCommander) {
        const phase1 = await post({ bracket });
        chosenCommander = (phase1?.commander as { name: string }).name;
        alts = (phase1?.alternativeCommanders as AlternativeCommander[]) ?? [];
        setGenerateStatus(`Commander gewählt: ${chosenCommander} - baue jetzt das Deck...`);
      }
      const phase2 = await post({ bracket, commanderName: chosenCommander });
      setAlternatives(alts);
      const finalResult = phase2 as unknown as GenerateResult;
      finalResult.alternativeCommanders = alts;
      setResult(finalResult);
    } catch (e) {
      setError(describeError(e, "Fehler beim Generieren"));
    } finally {
      setLoading(false);
      setGenerateStatus(null);
    }
  }

  function handleUseAlternative(name: string) {
    setCommanderName(name);
    handleGenerate(name);
  }

  async function handleCreateDeck() {
    if (!result) return;
    setCreating(true);
    setError(null);

    const deckRes = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: result.deckName || `${result.commander.name} (KI-Deck)`,
        commanderName: result.commander.name,
      }),
    });
    const deckData = await deckRes.json();
    if (!deckRes.ok) {
      setCreating(false);
      setError(deckData.error ?? "Deck konnte nicht angelegt werden");
      return;
    }

    const cardsRes = await fetch(`/api/decks/${deckData.deck.id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameEntries: result.cards.map((c) => ({ name: c.name, quantity: c.quantity })),
      }),
    });
    setCreating(false);
    if (!cardsRes.ok) {
      const cardsData = await cardsRes.json().catch(() => ({}));
      setError(cardsData.error ?? "Karten konnten nicht importiert werden");
      return;
    }

    router.push(`/decks/${deckData.deck.id}`);
    router.refresh();
  }

  const grouped = result
    ? CATEGORY_ORDER.map((cat) => ({
        category: cat,
        cards: result.cards.filter((c) => c.category === cat),
      })).filter((g) => g.cards.length > 0)
    : [];

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Link href="/collection" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition">
        ← Zurück zur Sammlung
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">🤖 AI Deck Generator</h1>
        <p className="text-zinc-400 mt-1">
          Wähle dein Ziel-Bracket - Claude sucht den besten Commander aus deiner Sammlung und baut daraus
          das stärkste Deck, das sich aus deinen freien Karten (nicht in anderen Decks verbaut)
          zusammenstellen lässt. Einen Commander vorgeben ist optional.
        </p>
      </header>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-indigo-300 mb-2">Ziel-Bracket</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {BRACKETS.map((b) => (
              <button
                key={b.value}
                onClick={() => setBracket(b.value)}
                className={`text-left rounded-lg border p-3 transition ${
                  bracket === b.value
                    ? "border-indigo-400 ring-2 ring-indigo-500/60 bg-zinc-800/50"
                    : "border-zinc-800 hover:border-indigo-500 bg-zinc-950/50"
                }`}
              >
                <p className="font-medium text-sm">{b.label}</p>
                <p className="text-xs text-zinc-400 mt-1">{b.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleGenerate()}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
          >
            {loading ? `Generiere... (${elapsedSeconds}s)` : "🔮 Schlag mir mein nächstes Deck vor"}
          </button>
          {commanderName && !loading && (
            <span className="text-xs text-zinc-400">
              Commander-Vorgabe: <span className="text-zinc-200">{commanderName}</span>{" "}
              <button onClick={() => setCommanderName("")} className="text-red-400 hover:text-red-300 ml-1">
                ✕ entfernen
              </button>
            </span>
          )}
        </div>

        {loading && generateStatus && (
          <p className="text-xs text-indigo-300 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            {generateStatus}
          </p>
        )}
        {loading && (
          <p className="text-xs text-zinc-500">
            Eine komplette Generierung kann je nach Sammlungsgröße 1-4 Minuten dauern.
          </p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {!result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <button
            onClick={() => setShowCommanderPicker((v) => !v)}
            className="text-sm font-medium text-indigo-300 hover:text-indigo-200 transition"
          >
            {showCommanderPicker ? "▾" : "▸"} Commander selbst vorgeben (optional)
          </button>
          {showCommanderPicker && (
            <div className="space-y-3">
              <input
                value={commanderName}
                onChange={(e) => setCommanderName(e.target.value)}
                placeholder="z. B. Atraxa, Praetors' Voice"
                className="w-full max-w-md rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {loadingCommanders && (
                <p className="text-sm text-zinc-500">Suche legendäre Kreaturen/Planeswalker in deiner Sammlung…</p>
              )}
              {!loadingCommanders && commanderOptions && commanderOptions.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {commanderOptions.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setCommanderName(c.name)}
                      className={`relative rounded-lg overflow-hidden border text-left transition ${
                        commanderName === c.name
                          ? "border-indigo-400 ring-2 ring-indigo-500/60"
                          : "border-zinc-800 hover:border-indigo-500"
                      }`}
                    >
                      {c.imageUrl ? (
                        <Image src={c.imageUrl} alt={c.name} width={244} height={340} className="w-full h-auto" />
                      ) : (
                        <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-xs p-2 text-center bg-zinc-950">
                          {c.name}
                        </div>
                      )}
                      {c.hasDeck && (
                        <span className="absolute top-1 left-1 bg-black/70 text-[10px] rounded px-1.5 py-0.5">
                          hat schon Deck
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex gap-4 items-start">
            {result.commander.imageUrl && (
              <Image
                src={result.commander.imageUrl}
                alt={result.commander.name}
                width={100}
                height={140}
                className="rounded-md shrink-0"
              />
            )}
            <div className="space-y-2">
              <h2 className="text-lg font-medium">
                {result.deckName || result.commander.name}
                <span className="text-zinc-400 font-normal"> · {result.commander.name}</span>
              </h2>
              <p className="text-sm text-zinc-400">{result.strategy}</p>
              <p className="text-sm text-zinc-500">
                {result.totalCount} Karten (aus deiner Sammlung, aktuell frei verfügbar)
              </p>
              <button
                onClick={handleCreateDeck}
                disabled={creating}
                className="bg-emerald-700 hover:bg-emerald-600 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
              >
                {creating ? "Deck wird erstellt..." : "Deck erstellen"}
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-indigo-300">
              Bracket-Einschätzung (Ziel: Bracket {result.targetBracket})
            </p>
            <p className="text-sm text-zinc-400">{result.bracketJustification}</p>
            {result.bracketCheck && (
              <div className="text-xs text-zinc-500 space-y-1 border-t border-zinc-800 pt-2">
                <p>
                  Regelbasierte Gegenprüfung: <span className="text-zinc-300">{result.bracketCheck.label}</span>
                  {result.bracketCheck.gameChangers.length > 0 && (
                    <> · Game Changer im Deck: {result.bracketCheck.gameChangers.join(", ")}</>
                  )}
                </p>
                {result.bracketCheck.reasons.map((r) => (
                  <p key={r}>· {r}</p>
                ))}
              </div>
            )}
          </div>

          {result.improvementAdvice && (
            <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-800/50 rounded-md px-3 py-2">
              {result.improvementAdvice}
            </p>
          )}

          {result.alternativeCommanders.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-indigo-300">Alternative Commander</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {result.alternativeCommanders.map((a) => (
                  <div key={a.name} className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                    {a.imageUrl && (
                      <Image src={a.imageUrl} alt={a.name} width={60} height={84} className="rounded-md shrink-0 h-fit" />
                    )}
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{a.name}</p>
                      <p className="text-xs text-zinc-400">{a.reasoning}</p>
                      <button
                        onClick={() => handleUseAlternative(a.name)}
                        disabled={loading}
                        className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                      >
                        → Deck mit diesem Commander bauen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.category}>
              <p className="text-sm font-medium text-indigo-300 mb-2">
                {group.category} ({group.cards.reduce((sum, c) => sum + c.quantity, 0)})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {group.cards.map((c) => (
                  <div
                    key={c.name}
                    className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300"
                  >
                    {c.quantity > 1 ? `${c.quantity}x ` : ""}
                    {c.name}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {result.combos && (result.combos.included.length > 0 || result.combos.almostIncluded.length > 0) && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-indigo-300">
                🧩 Combos (verifiziert über Commander Spellbook)
              </p>

              {result.combos.included.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">Im Deck enthalten</p>
                  {result.combos.included.map((c) => (
                    <div
                      key={c.cards.join("+")}
                      className="bg-emerald-900/20 border border-emerald-800/50 rounded-md px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-emerald-300">{c.cards.join(" + ")}</p>
                      <p className="text-xs text-zinc-400 mt-1">{c.description}</p>
                      {c.produces.length > 0 && (
                        <p className="text-xs text-zinc-500 mt-1">→ {c.produces.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {result.combos.almostIncluded.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">
                    Fast vorhanden – fehlt nur 1-2 Karten (lohnende Ergänzung für die Sammlung)
                  </p>
                  {result.combos.almostIncluded.map((c) => (
                    <div
                      key={c.cards.join("+")}
                      className="bg-amber-900/20 border border-amber-800/50 rounded-md px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-amber-300">{c.cards.join(" + ")}</p>
                      <p className="text-xs text-zinc-500">Fehlt: {c.missing.join(", ")}</p>
                      <p className="text-xs text-zinc-400 mt-1">{c.description}</p>
                      {c.produces.length > 0 && (
                        <p className="text-xs text-zinc-500 mt-1">→ {c.produces.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
