/** @type {import('tailwindcss').Config} */
// Design-System: kühle, tiefe Neutraltöne + leuchtendes Iris-Violett als
// Markenfarbe. Die bestehenden Klassen (zinc/indigo/rounded-*) werden hier
// zentral auf den neuen Look gemappt, damit alle Seiten einheitlich wirken.
module.exports = {
  // Hover-Effekte nur auf Geräten mit Maus – auf dem Handy blieben sie nach
  // dem Antippen "kleben" und lösten unnötige Neuzeichnungen aus.
  future: { hoverOnlyWhenSupported: true },
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        zinc: {
          50: "#f7f7fa",
          100: "#eeeef3",
          200: "#dcdce6",
          300: "#c4c4d2",
          400: "#9d9db2",
          500: "#73738a",
          600: "#545469",
          700: "#3a3a4d",
          800: "#25252f",
          900: "#17171e",
          950: "#0b0b10",
        },
        indigo: {
          50: "#f1f0ff",
          100: "#e4e2ff",
          200: "#cdc9ff",
          300: "#b1a8ff",
          400: "#9284ff",
          500: "#7764fb",
          600: "#6349ef",
          700: "#5338d3",
          800: "#4530aa",
          900: "#392c86",
          950: "#221a50",
        },
      },
      borderRadius: {
        md: "0.625rem",
        lg: "0.875rem",
        xl: "1.125rem",
        "2xl": "1.375rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        glow: "0 8px 30px -8px rgba(119, 100, 251, 0.55)",
        card: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 6px 16px -10px rgba(0,0,0,0.6)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
      },
      animation: {
        // nur "backwards": eine nachwirkende transform-Animation würde fixed-Kinder
        // (Blätter, Dialoge) an die Seite statt an den Bildschirm binden
        "fade-up": "fade-up 320ms cubic-bezier(.2,.8,.2,1) backwards",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};
