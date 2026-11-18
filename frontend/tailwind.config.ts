import type { Config } from 'tailwindcss'

/*
 * Avora design tokens.
 * The hex values are intentionally the same ones used inline across the
 * app (#F7F5F0 paper, #0E0D0A ink, #1A3DAF blue …) so older screens and the
 * named tokens below always match.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:        '#F7F5F0',
        paper:     '#F7F5F0',
        surface:   '#FFFFFF',
        'bg-warm': '#ECEAE3',
        ink: {
          DEFAULT: '#0E0D0A',
          soft:    '#2B2924',
          2:       '#5A5750',
          3:       '#8A877F',
        },
        line: {
          DEFAULT: '#DDD9D0',
          soft:    '#ECEAE4',
        },
        primary: { DEFAULT: '#1A3DAF', hover: '#14308A', light: '#EBF0FF' },
        muted:   { DEFAULT: '#9B9890', foreground: '#5A5750' },
        border:  { DEFAULT: '#DDD9D0', light: '#ECEAE4' },
        accent: {
          gold:   '#B8955A',
          green:  '#16A34A',
          red:    '#DC2626',
          amber:  '#D97706',
          purple: '#9333EA',
        },
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans:    ['"IBM Plex Sans"', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '6px', md: '8px', lg: '12px', xl: '16px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(14,13,10,0.05)',
        md: '0 1px 2px rgba(14,13,10,0.04), 0 4px 12px rgba(14,13,10,0.06)',
        lg: '0 2px 4px rgba(14,13,10,0.04), 0 12px 32px rgba(14,13,10,0.10)',
      },
      maxWidth: {
        page: '1180px',
      },
    },
  },
  plugins: [],
}

export default config
