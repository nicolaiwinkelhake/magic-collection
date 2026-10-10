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
    <form onSubmit={open} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-wrap gap-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Commander, z. B. Meren of Clan Nel Toth"
        aria-label="Commander"
        className="flex-1 min-w-[220px] rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <input
        value={partner}
        onChange={(e) => setPartner(e.target.value)}
        placeholder="Partner / Background (optional)"
        aria-label="Partner"
        className="flex-1 min-w-[220px] rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 rounded-md px-4 py-2 font-medium">
        Empfehlungen anzeigen
      </button>
    </form>
  );
}
