import type { MetadataRoute } from "next";
import { iconUrl } from "@/lib/brandVersion";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Magic Collection",
    short_name: "Magic",
    description:
      "Magic-Sammlung verwalten, Commander-Decks analysieren, traden und den Wertverlauf verfolgen.",
    start_url: "/collection",
    display: "standalone",
    background_color: "#0b0b10",
    theme_color: "#0b0b10",
    orientation: "portrait",
    icons: [
      { src: iconUrl("/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: iconUrl("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: iconUrl("/icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
