import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import SiteHeader from "@/components/layout/SiteHeader";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://itsyourmujahid-ai.github.io/video-eraser";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Video Eraser",
    template: "%s · Video Eraser",
  },
  description:
    "Video Eraser — remove logos, watermarks and burned-in text from videos. 100% in your browser, nothing ever uploaded.",
  keywords: [
    "video eraser",
    "remove logo from video",
    "remove watermark from video",
    "remove text from video",
    "video watermark remover",
    "logo remover",
    "video editor",
    "browser video tool",
  ],
  openGraph: {
    type: "website",
    siteName: "Video Eraser",
    title: "Video Eraser",
    description:
      "Remove logos, watermarks and burned-in text from videos — 100% in your browser, nothing ever uploaded.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Video Eraser",
    description:
      "Remove logos, watermarks and burned-in text from videos — 100% in your browser, nothing ever uploaded.",
  },
};

export const viewport: Viewport = {
  themeColor: "#070910",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}