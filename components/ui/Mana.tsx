// Farbige Mana-Pips (WUBRG) statt Buchstaben: für Filter, Manakosten in der
// Listenansicht und die Farbidentität von Decks.

const PIP_STYLE: Record<string, string> = {
  W: "bg-[#f8f1d8] text-zinc-900",
  U: "bg-[#3d8fd6] text-white",
  B: "bg-[#3b3335] text-zinc-100 ring-1 ring-inset ring-zinc-500",
  R: "bg-[#e0533b] text-white",
  G: "bg-[#2f9b5c] text-white",
  C: "bg-[#b8b2ad] text-zinc-900",
};

const COLOR_NAME: Record<string, string> = {
  W: "Weiß",
  U: "Blau",
  B: "Schwarz",
  R: "Rot",
  G: "Grün",
  C: "Farblos",
};

export function ManaPip({
  symbol,
  size = "sm",
  title,
}: {
  symbol: string;
  size?: "xs" | "sm" | "md";
  title?: string;
}) {
  const s = symbol.toUpperCase();
  const dims =
    size === "xs" ? "w-3.5 h-3.5 text-[8px]" : size === "md" ? "w-7 h-7 text-xs" : "w-4 h-4 text-[9px]";
  // Hybrid-/Phyrexia-Symbole: erste Farbe nehmen, sonst generisch grau.
  const base = PIP_STYLE[s] ?? PIP_STYLE[s[0]] ?? "bg-zinc-600 text-white";
  const label = PIP_STYLE[s] ? "" : s.replace("/", "");
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none shadow-sm ${dims} ${base}`}
      title={title ?? COLOR_NAME[s] ?? s}
      aria-hidden={title ? undefined : true}
    >
      {label}
    </span>
  );
}

/** "{2}{W}{U/B}" → Pips. Generische Zahlen werden als graue Kreise gezeigt. */
export function ManaCost({ cost, size = "sm" }: { cost: string | null | undefined; size?: "xs" | "sm" }) {
  if (!cost) return null;
  const faces = cost.split(" // ")[0];
  const symbols = [...faces.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (!symbols.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Manakosten ${faces}`}>
      {symbols.map((sym, i) => (
        <ManaPip key={i} symbol={sym} size={size} />
      ))}
    </span>
  );
}

/** Farbidentität eines Decks; farblos zeigt einen grauen Pip. */
export function ColorIdentity({ colors, size = "sm" }: { colors: string[] | null | undefined; size?: "xs" | "sm" }) {
  const order = ["W", "U", "B", "R", "G"];
  const list = (colors ?? []).filter((c) => order.includes(c)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <span className="inline-flex items-center gap-0.5">
      {(list.length ? list : ["C"]).map((c) => (
        <ManaPip key={c} symbol={c} size={size} />
      ))}
    </span>
  );
}

/** Seltenheit als farbiger Punkt (wie das Set-Symbol-Farbschema). */
export function RarityDot({ rarity }: { rarity: string | null | undefined }) {
  const color =
    rarity === "mythic"
      ? "bg-orange-500"
      : rarity === "rare"
        ? "bg-amber-300"
        : rarity === "uncommon"
          ? "bg-slate-300"
          : "bg-zinc-600";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={rarity ?? undefined} aria-hidden />;
}
