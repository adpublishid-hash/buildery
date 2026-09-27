import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      colors: {
        // Dashboard design tokens (Kravio). Channels live in globals.css so
        // opacity modifiers like `ring-kv-ring/40` keep working.
        kv: {
          bg: "rgb(var(--kv-bg) / <alpha-value>)",
          fg: "rgb(var(--kv-fg) / <alpha-value>)",
          card: "rgb(var(--kv-card) / <alpha-value>)",
          secondary: "rgb(var(--kv-secondary) / <alpha-value>)",
          "secondary-fg": "rgb(var(--kv-secondary-fg) / <alpha-value>)",
          muted: "rgb(var(--kv-muted) / <alpha-value>)",
          "muted-fg": "rgb(var(--kv-muted-fg) / <alpha-value>)",
          subtle: "rgb(var(--kv-subtle) / <alpha-value>)",
          cell: "rgb(var(--kv-cell) / <alpha-value>)",
          accent: "rgb(var(--kv-accent) / <alpha-value>)",
          success: "rgb(var(--kv-success) / <alpha-value>)",
          destructive: "rgb(var(--kv-destructive) / <alpha-value>)",
          border: "rgb(var(--kv-border) / <alpha-value>)",
          input: "rgb(0 0 0 / 0.1)",
          ring: "rgb(var(--kv-ring) / <alpha-value>)",
          hover: "#fafafa",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(.16, 1, .3, 1)",
      },
      boxShadow: {
        "kv-hover":
          "0px 2px 3px -1px rgba(0,0,0,0.1), 0px 1px 0px 0px rgba(25,28,33,0.02), 0px 0px 0px 1px rgba(25,28,33,0.08)",
        "kv-popover":
          "0px 0px 0px 1px rgba(0,0,0,0.06), 0px 1px 1px -0.5px rgba(0,0,0,0.06), 0px 3px 3px -1.5px rgba(0,0,0,0.06), 0px 6px 6px -3px rgba(0,0,0,0.06), 0px 12px 12px -6px rgba(0,0,0,0.06), 0px 24px 24px -12px rgba(0,0,0,0.06)",
        "kv-active": "0px 4px 7px 0px rgba(0,0,0,0.04)",
        "kv-soft": "0px 4px 14px 0px rgba(0,0,0,0.04)",
        "kv-drawer":
          "0 2.8px 2.2px rgba(0,0,0,0.034), 0 6.7px 5.3px rgba(0,0,0,0.048), 0 12.5px 10px rgba(0,0,0,0.06), 0 22.3px 17.9px rgba(0,0,0,0.072), 0 41.8px 33.4px rgba(0,0,0,0.086), 0 100px 80px rgba(0,0,0,0.12)",
      },
      keyframes: {
        "kv-rise": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "kv-fade": { from: { opacity: "0" }, to: { opacity: "1" } },
        "kv-draw": {
          from: { clipPath: "inset(0 100% 0 0)" },
          to: { clipPath: "inset(0)" },
        },
        "kv-grow": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        "kv-pop": {
          "0%": { opacity: "0", transform: "scale(.6)" },
          "60%": { opacity: "1", transform: "scale(1.12)" },
          to: { transform: "scale(1)" },
        },
        "kv-dd-in": {
          from: { opacity: "0", transform: "translateY(-4px) scale(.97)" },
          to: { opacity: "1", transform: "none" },
        },
        "kv-dd-out": {
          from: { opacity: "1" },
          to: { opacity: "0", transform: "scale(.98)" },
        },
        "kv-ring": {
          "0%, 100%": { transform: "rotate(0)" },
          "20%": { transform: "rotate(14deg)" },
          "40%": { transform: "rotate(-12deg)" },
          "60%": { transform: "rotate(8deg)" },
          "80%": { transform: "rotate(-4deg)" },
        },
        "kv-wave": {
          "0%, 100%": { transform: "rotate(0)" },
          "15%": { transform: "rotate(14deg)" },
          "30%": { transform: "rotate(-8deg)" },
          "45%": { transform: "rotate(14deg)" },
          "60%": { transform: "rotate(-4deg)" },
          "75%": { transform: "rotate(10deg)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "kv-rise": "kv-rise .52s cubic-bezier(.16, 1, .3, 1) both",
        "kv-fade": "kv-fade .3s ease-out both",
        "kv-draw": "kv-draw 1.1s cubic-bezier(.16, 1, .3, 1) both",
        "kv-grow": "kv-grow .9s cubic-bezier(.16, 1, .3, 1) both",
        "kv-pop": "kv-pop .26s cubic-bezier(.16, 1, .3, 1) both",
        "kv-dd-in": "kv-dd-in 180ms cubic-bezier(.16, 1, .3, 1)",
        "kv-dd-out": "kv-dd-out 120ms ease-in",
        "kv-ring": "kv-ring 600ms ease-in-out",
        "kv-wave": "kv-wave 1.8s ease-in-out 600ms 1",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
