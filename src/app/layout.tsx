import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rack & Frame League Manager",
  description: "League management for fixtures, results, and competitions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
