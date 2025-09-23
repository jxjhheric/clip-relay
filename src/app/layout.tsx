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
  title: "Clip Relay",
  description: "Self-hosted clipboard for text, files and images with realtime sync.",
  keywords: ["Clip Relay", "Next.js", "TypeScript", "Tailwind CSS", "shadcn/ui", "SSE"],
  authors: [{ name: "Clip Relay" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
  openGraph: {
    title: "Clip Relay",
    description: "Share snippets and files across devices in realtime.",
    siteName: "Clip Relay",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clip Relay",
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
