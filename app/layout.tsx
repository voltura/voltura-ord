import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ord.voltura.se"),
  title: "Voltura Ord · Ett ord till",
  description: "Ett vackert svenskt ordspel för två. Bjud in någon du tycker om och hitta orden tillsammans.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: "https://ord.voltura.se/",
    siteName: "Voltura Ord",
    title: "Voltura Ord · Ett ord till",
    description: "Ett vackert svenskt ordspel för två. Bjud in någon du tycker om och hitta orden tillsammans.",
    images: [{ url: "/social-preview.png", width: 1200, height: 630, type: "image/png", alt: "Voltura Ord – ett svenskt ordspel för två med vita bokstavsbrickor på ett grönt spelbräde." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Voltura Ord · Ett ord till",
    description: "Ett vackert svenskt ordspel för två. Bjud in någon du tycker om och hitta orden tillsammans.",
    images: [{ url: "/social-preview.png", alt: "Voltura Ord – ett svenskt ordspel för två med vita bokstavsbrickor på ett grönt spelbräde." }],
  },
  referrer: "no-referrer",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Voltura Ord", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f8f7f2" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className="antialiased">{children}</body>
    </html>
  );
}
