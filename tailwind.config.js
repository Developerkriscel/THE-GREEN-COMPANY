/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'oklch(62% .19 43)',
          'primary-dark': 'oklch(54% .19 40)',
          'primary-glow': 'oklch(72% .18 48)',
          dark: 'oklch(20% .06 260)',
          darker: 'oklch(14% .05 260)',
          sidebar: 'oklch(18% .06 260)',
          gold: 'oklch(80% .16 85)',
          'gold-light': 'oklch(85% .15 85)',
          'gold-dark': 'oklch(70% .17 75)',
          muted: 'oklch(42% .04 55)',
          // keep old green shades for dashboard UI that still references them
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        gold: {
          400: '#d4af37',
          500: '#c19b2e',
          600: '#a67c1a',
        },
      },
      backgroundImage: {
        'gradient-hero':
          'linear-gradient(135deg, oklch(20% .06 260) 0%, oklch(14% .05 260) 45%, oklch(62% .19 43) 100%)',
        'gradient-primary':
          'linear-gradient(135deg, oklch(68% .18 48) 0%, oklch(54% .19 40) 100%)',
        'gradient-gold':
          'linear-gradient(135deg, oklch(85% .15 85) 0%, oklch(70% .17 75) 100%)',
        'gradient-dark':
          'linear-gradient(180deg, oklch(20% .06 260) 0%, oklch(14% .05 260) 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        'fade-up': 'fade-up .5s ease-out both',
        'fade-in': 'fade-in .3s ease-out both',
      },
      boxShadow: {
        elegant: '0 20px 50px -20px oklch(62% .19 43 / .35)',
        glow: '0 0 40px oklch(72% .18 48 / .35)',
      },
    },
  },
  plugins: [],
}
