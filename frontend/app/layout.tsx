// frontend/app/layout.tsx
/**
 * AI Hospital Command Center — Root Layout
 * =========================================
 * Next.js App Router root layout.
 * Loads Google Fonts (Space Mono + DM Sans), wraps providers,
 * injects global CSS variables.
 */

import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

// ── Font loading ───────────────────────────────────────────────────────────

const jetbrainsMono = JetBrains_Mono({
  weight:   ["400", "600"],
  subsets:  ["latin"],
  variable: "--font-mono",
  display:  "swap",
});

// ── Metadata ───────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       "AI Hospital Command Center",
  description: "AI-Powered Hospital Operations Intelligence & Clinical Digital Twin Platform",
  keywords:    ["hospital", "AI", "operations", "command center", "healthcare"],
  authors:     [{ name: "AI Hospital Command Center Team" }],
};

export const viewport: Viewport = {
  themeColor:   "#020617",
  colorScheme:  "dark",
  width:        "device-width",
  initialScale: 1,
};

// ── Layout ─────────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
      </head>
      <body className="font-sans antialiased">
        {/* Subtle grid overlay */}
        <div
          className="pointer-events-none fixed inset-0 z-[9999] opacity-[0.02]"
          style={{
            backgroundImage:
              "linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px), linear-gradient(90deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)",
            backgroundSize: "40px 40px",
          }}
          aria-hidden="true"
        />

        {/* Main content */}
        {children}

        {/* Toast notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background:    "#0f172a",
              color:         "#f1f5f9",
              border:        "1px solid #334155",
              borderRadius:  "8px",
              fontFamily:    "system-ui, sans-serif",
              fontSize:      "14px",
            },
            success: {
              iconTheme: { primary: "#34d399", secondary: "#0f172a" },
            },
            error: {
              iconTheme: { primary: "#ef4444", secondary: "#0f172a" },
            },
          }}
        />
      </body>
    </html>
  );
}