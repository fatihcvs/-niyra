import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";
import "./social-design.css"; // Shared light/dark social interface.
import "./social-workspaces.css";
import "./mobile-app.css";
import "./mobile-workspaces.css";
import "./mobile-profile.css";
import "./visual-polish.css";
import "./notes-workspace.css";
import "./campus-workspace.css";
import "./interaction-motion.css";
import PlatformBanner from "./platform-banner";
import { MobileRuntime } from "./mobile-runtime";

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#17181c" }],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://web-production-da44f.up.railway.app"),
  title: { default: "Kampira · Kampüsün tek yerde", template: "%s · Kampira" },
  description: "Kampüsün, derslerin, notların, öğrenci mağazan ve akademik çevren tek bir güvenli sosyal ağda.",
  applicationName: "Kampira",
  appleWebApp: { capable: true, title: "Kampira", statusBarStyle: "default" },
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
    apple: "/app-icons/kampira-180.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("kampira-theme")||localStorage.getItem("uniyra-theme")||"system";localStorage.setItem("kampira-theme",p);var d=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;document.documentElement.dataset.theme=d;document.documentElement.dataset.themePreference=p;}catch(e){document.documentElement.dataset.theme="light";document.documentElement.dataset.themePreference="system";}})();`,
          }}
        />
      </head>
      <body><MobileRuntime /><PlatformBanner />{children}</body>
    </html>
  );
}
