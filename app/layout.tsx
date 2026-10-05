import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://looprepuestos.com.ar"),
  title: "LOOP REPUESTOS — Repuestos para celulares",
  description:
    "Catálogo y lista de precios de repuestos para celulares. Buscá por modelo o tipo.",
  applicationName: "LOOP REPUESTOS",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LOOP REPUESTOS",
    statusBarStyle: "default",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "/",
    siteName: "LOOP REPUESTOS",
    title: "LOOP REPUESTOS — Repuestos para celulares",
    description:
      "Catálogo y lista de precios de repuestos para celulares. Buscá por modelo o tipo.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
