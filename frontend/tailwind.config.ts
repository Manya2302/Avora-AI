import type { Config } from 'tailwindcss'

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
        bg:       '#F7F5F0',
        surface:  '#FFFFFF',
        'bg-warm':'#ECEAE3',
        primary:  { DEFAULT: '#1A3DAF', hover: '#14308A', light: '#EBF0FF' },
        muted:    { DEFAULT: '#9B9890', foreground: '#5A5750' },
        border:   { DEFAULT: '#DDD9D0', light: '#ECEAE4' },
        accent: {
          gold:    '#B8955A',
          green:   '#16A34A',
          red:     '#DC2626',
          amber:   '#D97706',
          purple:  '#9333EA',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans:    ['DM Sans', '-apple-system', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        sm: '7px', md: '11px', lg: '16px', xl: '20px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        md: '0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)',
        lg: '0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
}

export default config
