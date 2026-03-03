import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ryder - Scenic Routes for Riders",
  description: "Community-driven scenic routing & social platform for motorcycle riders",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-white antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
