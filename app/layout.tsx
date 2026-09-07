import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { PreviewAccessGate, hasPreviewAccess } from "./preview-access";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LOOP REPUESTOS — Repuestos para celulares",
  description:
    "Catálogo y lista de precios de repuestos para celulares. Buscá por modelo o tipo.",
  applicationName: "LOOP REPUESTOS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LOOP REPUESTOS",
    statusBarStyle: "default",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#FFFFFF",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const allowed = await hasPreviewAccess();

  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {allowed ? children : <PreviewAccessGate />}
      </body>
    </html>
  );
}
