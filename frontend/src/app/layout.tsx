import type { Metadata } from "next";
import { Inter, Inter_Tight, Geist_Mono } from "next/font/google";
import "./globals.css";


// Inter — UI body type. Free, open-source.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Inter Tight — substitute for Domaine Display. Tight tracking + light weights
// approximate the editorial-serif silhouette without licensing a proprietary
// face. Per the Resend spec's substitution guidance.
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  weight: ["300", "400", "500", "600"],
});

// Geist Mono — code blocks, IDs, monospaced data. Free, open-source.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});


export const metadata: Metadata = {
  title: "Rydr — destinations for riders",
  description: "Discover, plan, and remember rides with the people you ride with.",
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${interTight.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen bg-canvas text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
