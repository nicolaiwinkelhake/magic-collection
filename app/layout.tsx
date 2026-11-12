import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
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
  themeColor: "#0b0b10",
  viewportFit: "cover",
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
    <html lang="de" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={user ? "has-tabbar" : undefined}>
        <AppNav email={user?.email ?? null} />
        {children}
        <PWAProvider />
      </body>
    </html>
  );
}
