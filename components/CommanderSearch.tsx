"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Commander (optional mit Partner) per Name öffnen. Die Seite selbst löst den
// Namen bei Scryfall auf (Tippfehler und deutsche Namen werden toleriert).
export function CommanderSearch() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [partner, setPartner] = useState("");

  function open(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const q = partner.trim() ? `?partner=${encodeURIComponent(partner.trim())}` : "";
    router.push(`/commanders/${encodeURIComponent(name.trim())}${q}`);
  }

  return (
    <form onSubmit={open} className="surface p-4 flex flex-wrap gap-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Commander, z. B. Meren of Clan Nel Toth"
        aria-label="Commander"
        className="input w-auto flex-1 min-w-0 min-w-[220px]"
      />
      <input
        value={partner}
        onChange={(e) => setPartner(e.target.value)}
        placeholder="Partner / Background (optional)"
        aria-label="Partner"
        className="input w-auto flex-1 min-w-0 min-w-[220px]"
      />
      <button type="submit" className="btn-primary">
        Empfehlungen anzeigen
      </button>
    </form>
  );
}
