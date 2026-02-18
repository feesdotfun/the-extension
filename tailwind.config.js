/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // Legacy tokens (used by sub-components: PingIndicator, CreateWallet, etc.)
        brand: {
          DEFAULT: "#3248f6",
          light: "#4a5df7",
          dark: "#2a3cd4",
          glow: "rgba(50, 72, 246, 0.3)",
          subtle: "rgba(50, 72, 246, 0.08)",
        },
        surface: {
          base: "#09090f",
          raised: "#0f0f17",
          overlay: "#13131d",
          border: "#1a1a2e",
          "border-light": "#252540",
        },
        // New HSL variable-based design tokens
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
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        body: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Sora", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out forwards",
        "fade-in": "fade-in 0.2s ease-out forwards",
        "scale-in": "scale-in 0.5s cubic-bezier(0.16,1,0.3,1) forwards",
        "slide-in-right": "slide-in-right 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
        "slide-out-left": "slide-out-left 0.3s cubic-bezier(0.7,0,0.84,0) forwards",
        "float": "float 6s ease-in-out infinite",
        "shimmer": "shimmer 2.5s linear infinite",
        "check-draw": "check-draw 0.4s ease-out forwards",
        "bounce-in": "bounce-in 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "count-up": "count-up 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "number-pop": "number-pop 0.8s cubic-bezier(0.16,1,0.3,1) forwards",
        "ring-expand": "ring-expand 1.5s ease-out forwards",
        "sparkle": "sparkle 1.5s ease-in-out infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 8px 2px rgba(50, 72, 246, 0.3)" },
          "50%": { boxShadow: "0 0 16px 4px rgba(50, 72, 246, 0.5)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.9)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(40px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-out-left": {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(-40px)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "shimmer": {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "check-draw": {
          from: { strokeDashoffset: "20" },
          to: { strokeDashoffset: "0" },
        },
        "bounce-in": {
          from: { opacity: "0", transform: "scale(0.3)" },
          "50%": { transform: "scale(1.05)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.1)" },
        },
        "number-pop": {
          "0%": { opacity: "0", transform: "scale(0.5) translateY(20px)" },
          "60%": { opacity: "1", transform: "scale(1.08) translateY(-2px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "ring-expand": {
          from: { opacity: "0.6", transform: "scale(0.8)" },
          to: { opacity: "0", transform: "scale(2)" },
        },
        "sparkle": {
          "0%, 100%": { opacity: "0", transform: "scale(0)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
