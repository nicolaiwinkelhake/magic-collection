import localFont from "next/font/local";

// Schriften des Logos (Cinzel / Cinzel Decorative, SIL Open Font License).
// Lokal eingebunden, damit der Build nicht von Google Fonts abhängt.
export const cinzel = localFont({
  src: "../app/fonts/Cinzel-Black.woff2",
  weight: "900",
  variable: "--font-cinzel",
  display: "swap",
});

export const cinzelDecorative = localFont({
  src: "../app/fonts/CinzelDecorative-Black.woff2",
  weight: "900",
  variable: "--font-cinzel-deco",
  display: "swap",
});
