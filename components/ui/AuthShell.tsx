import type { ReactNode } from "react";

// Rahmen für Anmelden/Registrieren/Passwort: Logo, Claim und ein Fächer aus
// stilisierten Karten in den fünf Manafarben im Hintergrund.
const FAN = [
  { rot: -24, x: -112, from: "from-amber-200", to: "to-amber-500" },
  { rot: -12, x: -56, from: "from-sky-300", to: "to-blue-600" },
  { rot: 0, x: 0, from: "from-zinc-500", to: "to-zinc-900" },
  { rot: 12, x: 56, from: "from-rose-400", to: "to-red-700" },
  { rot: 24, x: 112, from: "from-emerald-300", to: "to-green-700" },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-[calc(1.5rem+env(safe-area-inset-top))] h-48 w-0" aria-hidden>
        {FAN.map((c, i) => (
          <span
            key={i}
            className={`absolute -left-12 top-0 h-36 w-24 rounded-xl bg-gradient-to-br ${c.from} ${c.to} opacity-50 shadow-2xl shadow-black/60 ring-1 ring-inset ring-white/30`}
            style={{ transform: `translateX(${c.x}px) translateY(${Math.abs(c.rot) * 1.4}px) rotate(${c.rot}deg)` }}
          >
            <span className="absolute inset-2 rounded-lg border border-white/30 bg-black/10" />
          </span>
        ))}
        <span className="absolute -left-40 top-10 h-40 w-80 rounded-full bg-indigo-500/30 blur-3xl" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-transparent via-[#0b0b10]/40 to-[#0b0b10]" aria-hidden />

      <div className="relative w-full max-w-sm animate-fade-up mt-52">
        <div className="mb-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gradient">Magic Collection</h2>
          <p className="mt-1.5 text-sm text-zinc-400">Eure Sammlung, Decks und Wunschlisten – immer dabei.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
