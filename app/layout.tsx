import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PlatformBanner from "./platform-banner";

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
  title: { default: "Kampira · Kampüsün tek yerde", template: "%s · Kampira" },
  description: "Kampüsün, derslerin, notların, öğrenci mağazan ve akademik çevren tek bir güvenli sosyal ağda.",
  openGraph: {
    title: "Kampira · Kampüsün tek yerde",
    description: "Ders çevreleri, güvenilir notlar, kampüs gündemi ve öğrenciden öğrenciye mağaza.",
    type: "website",
    locale: "tr_TR",
    siteName: "Kampira",
    images: [{ url: "/kampira-social-card.jpg", width: 1200, height: 630, alt: "Kampira kampüs topluluğu illüstrasyonu" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kampira · Kampüsün tek yerde",
    description: "Ders çevreleri, güvenilir notlar ve öğrenciden öğrenciye kampüs yaşamı.",
    images: ["/kampira-social-card.jpg"],
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [{ url: "/kampira-mark.png", type: "image/png", sizes: "1254x1254" }],
    shortcut: "/kampira-mark.png",
    apple: "/kampira-mark.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("kampira-theme")||localStorage.getItem("uniyra-theme")||"system";localStorage.setItem("kampira-theme",p);var d=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;document.documentElement.dataset.theme=d;document.documentElement.dataset.themePreference=p;}catch(e){document.documentElement.dataset.theme="light";document.documentElement.dataset.themePreference="system";}})();`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}><PlatformBanner />{children}</body>
    </html>
  );
}
