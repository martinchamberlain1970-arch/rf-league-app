import type { Metadata, Viewport } from "next";
import PwaRegistration from "@/components/PwaRegistration";
import AppDialogProvider from "@/components/AppDialogProvider";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Rack & Frame",
  title: {
    default: "Rack & Frame League Manager",
    template: "%s | Rack & Frame",
  },
  description: "League management for fixtures, results, and competitions",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "R&F League",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/rack-frame-icon-192-v2.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/rack-frame-icon-512-v2.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/rack-frame-apple-touch-v2.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">
        <AppDialogProvider>
          {children}
          <PwaRegistration />
        </AppDialogProvider>
      </body>
    </html>
  );
}
