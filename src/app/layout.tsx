import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cloud Clipboard",
  description: "Self-hosted cloud clipboard for text, files and images with realtime sync.",
  keywords: ["Cloud Clipboard", "Next.js", "TypeScript", "Tailwind CSS", "shadcn/ui", "Socket.IO"],
  authors: [{ name: "Cloud Clipboard" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
  openGraph: {
    title: "Cloud Clipboard",
    description: "Share snippets and files across devices in realtime.",
    siteName: "Cloud Clipboard",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cloud Clipboard",
    description: "Share snippets and files across devices in realtime.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
