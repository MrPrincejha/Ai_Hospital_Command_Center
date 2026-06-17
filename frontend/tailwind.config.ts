// frontend/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ── Design token palette ─────────────────────────────────────────────────
      colors: {
        // Base surfaces — deep industrial slate
        surface: {
          950: "#060810",
          900: "#0a0d14",
          800: "#0f1420",
          700: "#141b2d",
          600: "#1a2238",
          500: "#212c45",
        },
        // Cyan — primary accent (telemetry, active states)
        cyan: {
          50:  "#ecfffe",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
          950: "#083344",
        },
        // Amber — warning accent
        amber: {
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
        // Red — critical / alert
        red: {
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          900: "#7f1d1d",
        },
        // Emerald — normal / healthy
        emerald: {
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
        },
        // Text hierarchy
        ink: {
          primary:   "#e2e8f7",
          secondary: "#8fa3c8",
          muted:     "#4a5d80",
          dim:       "#2a3a58",
        },
      },

      // ── Typography ───────────────────────────────────────────────────────────
      fontFamily: {
        // Display: used for big numbers and headers
        display: ["'Space Mono'", "ui-monospace", "monospace"],
        // Body: clean without being Inter
        body: ["'DM Sans'", "system-ui", "sans-serif"],
        // Data: strictly monospaced for telemetry values
        mono: ["'Space Mono'", "ui-monospace", "Consolas", "monospace"],
      },

      // ── Spacing ──────────────────────────────────────────────────────────────
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "72": "18rem",
        "84": "21rem",
        "96": "24rem",
      },

      // ── Shadows — glows matching the cyan accent ─────────────────────────────
      boxShadow: {
        "cyan-glow":    "0 0 20px rgba(6, 182, 212, 0.25), 0 0 60px rgba(6, 182, 212, 0.08)",
        "cyan-glow-sm": "0 0 8px rgba(6, 182, 212, 0.35)",
        "amber-glow":   "0 0 20px rgba(245, 158, 11, 0.25)",
        "red-glow":     "0 0 20px rgba(239, 68, 68, 0.30)",
        "card":         "0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)",
        "card-hover":   "0 2px 8px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.4)",
        "inset-border": "inset 0 1px 0 rgba(255,255,255,0.05)",
      },

      // ── Border radius ────────────────────────────────────────────────────────
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },

      // ── Animations ───────────────────────────────────────────────────────────
      keyframes: {
        "pulse-cyan": {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0.4" },
        },
        "scan-line": {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "blink": {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0" },
        },
        "counter": {
          "0%":   { opacity: "0", transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "pulse-cyan":  "pulse-cyan 2s ease-in-out infinite",
        "scan-line":   "scan-line 8s linear infinite",
        "slide-up":    "slide-up 0.4s ease-out forwards",
        "fade-in":     "fade-in 0.3s ease-out forwards",
        "blink":       "blink 1s step-end infinite",
        "counter":     "counter 0.3s ease-out forwards",
      },

      // ── Backdrop blur ────────────────────────────────────────────────────────
      backdropBlur: {
        xs: "2px",
      },

      // ── Grid ─────────────────────────────────────────────────────────────────
      gridTemplateColumns: {
        "dashboard": "280px 1fr",
        "cards-4":   "repeat(4, 1fr)",
        "cards-2":   "repeat(2, 1fr)",
      },
    },
  },
  plugins: [],
};

export default config;