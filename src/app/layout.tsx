import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

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
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
