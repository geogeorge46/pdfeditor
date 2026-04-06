import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { UnregisterSw } from "./UnregisterSw";
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
  title: "PDF Editor Desktop",
  description: "Offline-first privacy-focused PDF Editor",
  applicationName: "PDF Editor PWA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PDF Editor",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {process.env.NODE_ENV === "development" && <UnregisterSw />}
        {children}
      </body>
    </html>
  );
}
