/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
          on: "hsl(var(--mono-accent-on) / <alpha-value>)",
        },

        /* ------------------------------------------------------------------
           Monochrome semantic ramps.
           There is no brand hue in this UI. These four scales keep their
           familiar utility names so ~310 existing call sites go monochrome
           without being touched, and invert with the theme automatically.
           Meaning survives through LIGHTNESS DISTANCE, not colour:
             blue    = accent        · full ink, the loudest voice
             rose    = danger        · full ink + solid fills that invert
             amber   = warning       · mid ink, present but not shouting
             emerald = success       · low ink, deliberately recedes
           Success recedes and failure stands out, which is the correct
           information hierarchy. Every status also carries an icon or a
           fill change, so nothing is signalled by tone alone.
           ------------------------------------------------------------------ */
        blue: {
          200: "hsl(var(--mono-accent-strong) / <alpha-value>)",
          300: "hsl(var(--mono-accent-strong) / <alpha-value>)",
          400: "hsl(var(--mono-accent) / <alpha-value>)",
          450: "hsl(var(--mono-accent) / <alpha-value>)",
          500: "hsl(var(--mono-accent) / <alpha-value>)",
          600: "hsl(var(--mono-accent-strong) / <alpha-value>)",
          700: "hsl(var(--mono-accent-strong) / <alpha-value>)",
          950: "hsl(var(--mono-accent-strong) / <alpha-value>)",
        },
        rose: {
          200: "hsl(var(--mono-alert) / <alpha-value>)",
          300: "hsl(var(--mono-alert) / <alpha-value>)",
          400: "hsl(var(--mono-alert) / <alpha-value>)",
          450: "hsl(var(--mono-alert) / <alpha-value>)",
          500: "hsl(var(--mono-alert) / <alpha-value>)",
          600: "hsl(var(--mono-alert) / <alpha-value>)",
          900: "hsl(var(--mono-alert) / <alpha-value>)",
          950: "hsl(var(--mono-alert) / <alpha-value>)",
        },
        amber: {
          200: "hsl(var(--mono-warn) / <alpha-value>)",
          300: "hsl(var(--mono-warn) / <alpha-value>)",
          400: "hsl(var(--mono-warn) / <alpha-value>)",
          500: "hsl(var(--mono-warn) / <alpha-value>)",
          600: "hsl(var(--mono-warn) / <alpha-value>)",
        },
        emerald: {
          400: "hsl(var(--mono-ok) / <alpha-value>)",
          450: "hsl(var(--mono-ok) / <alpha-value>)",
          500: "hsl(var(--mono-ok) / <alpha-value>)",
          600: "hsl(var(--mono-ok) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        dark: {
          900: "#07090e",
          800: "#0e1118",
          700: "#151b26",
          600: "#1e2638",
          500: "#2d3954",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Fira Code', 'Courier New', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
