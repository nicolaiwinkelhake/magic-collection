// Nur Pfade innerhalb der App als Weiterleitungsziel zulassen (kein
// "//evil.com" oder "https://..."), sonst Standard: Sammlung.
export function safeNextPath(next: string | null | undefined, fallback = "/collection"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
