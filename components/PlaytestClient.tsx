"use client";

import { useState } from "react";
import Image from "next/image";
import {
  newGame,
  mulligan,
  draw,
  countLands,
  type PlaytestCard,
  type GameState,
} from "@/lib/playtest";

export function PlaytestClient({ cards }: { cards: PlaytestCard[] }) {
  const [game, setGame] = useState<GameState | null>(null);

  function start() {
    setGame(newGame(cards));
  }
  function doMulligan() {
    if (game) setGame(mulligan(cards, game));
  }
  function doDraw() {
    if (game) setGame(draw(game).state);
  }

  const lands = game ? countLands(game.hand) : 0;
  const nonCommander = cards.filter((c) => !c.is_commander).length;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">🎲 Playtester (Goldfishing)</h2>
        {!game ? (
          <button
            onClick={start}
            className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-3 py-1.5 text-sm font-medium"
          >
            Testhand ziehen
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={doDraw}
              disabled={game.library.length === 0}
              className="bg-zinc-700 hover:bg-zinc-600 transition rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Nachziehen
            </button>
            <button
              onClick={doMulligan}
              className="bg-amber-700/70 hover:bg-amber-600 transition rounded-md px-3 py-1.5 text-sm"
            >
              Mulligan
            </button>
            <button
              onClick={start}
              className="bg-zinc-800 hover:bg-zinc-700 transition rounded-md px-3 py-1.5 text-sm"
            >
              Neu
            </button>
          </div>
        )}
      </div>

      {!game && (
        <p className="text-xs text-zinc-500 mt-1">
          Simuliert eine Starthand aus {nonCommander} Karten (Commander bleibt in
          der Command Zone). Rein zum Testen der Kurve – kein echtes Spiel.
        </p>
      )}

      {game && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
            <span>
              Hand: <span className="text-zinc-200">{game.hand.length}</span>
            </span>
            <span>
              Länder in Hand:{" "}
              <span
                className={
                  lands >= 2 && lands <= 5 ? "text-emerald-400" : "text-amber-400"
                }
              >
                {lands}
              </span>
            </span>
            <span>
              Bibliothek:{" "}
              <span className="text-zinc-200">{game.library.length}</span>
            </span>
            {game.mulligans > 0 && (
              <span className="text-amber-400">Mulligans: {game.mulligans}</span>
            )}
          </div>

          {lands === 0 && (
            <p className="text-sm text-amber-400">
              Keine Länder – klassischer Mulligan-Kandidat.
            </p>
          )}
          {lands >= 6 && (
            <p className="text-sm text-amber-400">
              Sehr landlastig – ebenfalls ein Mulligan wert.
            </p>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {game.hand.map((c, i) => (
              <div
                key={`${c.id}-${i}`}
                className="rounded-md overflow-hidden bg-zinc-950 border border-zinc-800"
              >
                {c.image_url ? (
                  <Image
                    src={c.image_url}
                    alt={c.name}
                    width={244}
                    height={340}
                    className="w-full h-auto"
                  />
                ) : (
                  <div className="aspect-[244/340] flex items-center justify-center text-[10px] text-zinc-500 p-1 text-center">
                    {c.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
