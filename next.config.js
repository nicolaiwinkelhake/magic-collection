/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Besuchte Seiten 3 Minuten im Gerät behalten: Zurück auf einen Reiter,
    // den man gerade offen hatte, braucht dann keinen Server mehr. Nach
    // Änderungen ruft die App router.refresh() auf – das leert diesen Speicher.
    staleTimes: { dynamic: 180, static: 300 },
  },
  images: {
    // Bilder direkt von Scryfall laden: Scryfall liefert sie schon komprimiert,
    // und Vercels Bildoptimierung hat ein Monatskontingent – ist es aufgebraucht,
    // bleiben neue Kartenbilder leer.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cards.scryfall.io",
      },
      {
        protocol: "https",
        hostname: "c1.scryfall.com",
      },
    ],
  },
};

module.exports = nextConfig;
