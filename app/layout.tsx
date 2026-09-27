import type { Metadata } from "next";
import { Suspense } from "react";
import { DM_Sans } from "next/font/google";

import { AuthProvider } from "@/components/providers/session-provider";
import { ChunkReloadGuard } from "@/components/ui/chunk-reload-guard";
import { Toaster } from "@/components/ui/toaster";
import { RouteProgress } from "@/components/ui/route-progress";

import "./globals.css";

// DM Sans — the app's UI typeface. Exposed as --font-sans so Tailwind's
// `font-sans` (and the preflight default) pick it up everywhere.
const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "My Landing — Build websites in minutes",
    template: "%s · My Landing",
  },
  description:
    "My Landing is a Notion-style website builder. Design, publish, and grow — all from one minimalist workspace.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <body>
        <AuthProvider>
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <ChunkReloadGuard />
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
