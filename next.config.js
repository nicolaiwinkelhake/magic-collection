/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Besuchte Seiten 3 Minuten im Gerät behalten: Zurück auf einen Reiter,
    // den man gerade offen hatte, braucht dann keinen Server mehr. Nach
    // Änderungen ruft die App router.refresh() auf – das leert diesen Speicher.
    staleTimes: { dynamic: 180, static: 300 },
  },
  images: {
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
