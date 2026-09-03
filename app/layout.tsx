import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://web-production-da44f.up.railway.app"),
  title: { default: "Üniyra · Kampüsün tek yerde", template: "%s · Üniyra" },
  description: "Kampüsün, derslerin, notların, öğrenci mağazan ve akademik çevren tek bir güvenli sosyal ağda.",
  openGraph: {
    title: "Üniyra · Kampüsün tek yerde",
    description: "Ders çevreleri, güvenilir notlar, kampüs gündemi ve öğrenciden öğrenciye mağaza.",
    type: "website",
    locale: "tr_TR",
    siteName: "Üniyra",
    images: [{ url: "/uniyra-social-card.jpg", width: 1200, height: 630, alt: "Üniyra kampüs topluluğu illüstrasyonu" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Üniyra · Kampüsün tek yerde",
    description: "Ders çevreleri, güvenilir notlar ve öğrenciden öğrenciye kampüs yaşamı.",
    images: ["/uniyra-social-card.jpg"],
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/uniyra-mark.png", type: "image/png", sizes: "512x512" }],
    shortcut: "/favicon.svg",
    apple: "/uniyra-mark.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
