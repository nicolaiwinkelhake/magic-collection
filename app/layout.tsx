import "./globals.css";
import type { Metadata, Viewport } from "next";
import { PWAProvider } from "@/components/PWAProvider";
import { AppNav } from "@/components/AppNav";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Magic Collection",
  description: "Eure gemeinsame Magic: The Gathering Kartenübersicht",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Magic",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0f12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Navigation nur für angemeldete Nutzer (Login-Seiten bleiben schlicht).
  const {
    data: { user },
  } = await createClient().auth.getUser();

  return (
    <html lang="de">
      <body>
        <AppNav email={user?.email ?? null} />
        {children}
        <PWAProvider />
      </body>
    </html>
  );
}
