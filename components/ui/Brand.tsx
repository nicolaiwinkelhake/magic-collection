import { useId } from "react";

// Logo von Magic Collection: Amethyst-Kristall mit Vierstern (eigenes Motiv) und Silber-Schriftzug in Cinzel.

export function BrandEmblem({ className = "h-9 w-auto" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 200 260" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ddd6fe" />
          <stop offset="0.35" stopColor="#8b5cf6" />
          <stop offset="0.75" stopColor="#5b21b6" />
          <stop offset="1" stopColor="#2e1065" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <path d="M100 6 L176 96 L100 254 L24 96 Z" fill={`url(#${id}f)`} />
      <path d="M100 6 L176 96 L100 254 L24 96 Z" fill={`url(#${id}s)`} />
      <path d="M24 96 L176 96" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2" />
      <path d="M100 6 L68 96 L100 254 M100 6 L132 96 L100 254" fill="none" stroke="#0b0716" strokeOpacity="0.28" strokeWidth="2" />
      <path d="M100 104 l9 27 27 9 -27 9 -9 27 -9 -27 -27 -9 27 -9z" fill="#ffffff" />
    </svg>
  );
}

/** Kompakt für die Kopfzeile: Kristall + MAGIC / COLLECTION */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2">
      <BrandEmblem className="h-9 w-auto drop-shadow-[0_2px_8px_rgba(139,92,246,0.5)]" />
      <span className="flex flex-col leading-none">
        <span className="font-brand-deco text-[1.15rem] tracking-[0.02em] text-silver">MAGIC</span>
        <span className="font-brand text-[0.5rem] tracking-[0.42em] text-silver mt-[3px]">COLLECTION</span>
      </span>
    </span>
  );
}

/** Groß für Anmelden/Registrieren: mit „by Nicolai Winkelhake“ */
export function BrandLockup() {
  return (
    <div className="flex items-center justify-center gap-3.5">
      <BrandEmblem className="h-24 w-auto drop-shadow-[0_6px_24px_rgba(139,92,246,0.5)]" />
      <div className="text-left leading-none">
        <div className="font-brand-deco text-[2.9rem] text-silver">MAGIC</div>
        <div className="font-brand text-[0.95rem] tracking-[0.42em] text-silver mt-1.5">COLLECTION</div>
        <div className="font-brand text-[0.55rem] tracking-[0.3em] text-silver opacity-75 mt-2">BY NICOLAI WINKELHAKE</div>
      </div>
    </div>
  );
}
