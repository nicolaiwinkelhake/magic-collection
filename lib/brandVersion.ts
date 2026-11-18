// Version des App-Symbols. Bei einem neuen Symbol hochzählen: Die Symbol-URLs
// bekommen sie als ?v=…, damit Browser/Android nicht das alte aus dem Cache
// nehmen, und iPhone-Nutzer sehen einmalig den Hinweis zum Neu-Hinzufügen.
export const ICON_VERSION = "2026-11-18";
export const iconUrl = (path: string) => `${path}?v=${ICON_VERSION}`;
