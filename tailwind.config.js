/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // Every colour reads a CSS variable from src/index.css (sampled from the logo).
          primary: 'rgb(var(--c-primary) / <alpha-value>)',
          'primary-dark': 'rgb(var(--c-primary-dark) / <alpha-value>)',
          'primary-light': 'rgb(var(--c-primary-light) / <alpha-value>)',
          'primary-glow': 'rgb(var(--c-primary-glow) / <alpha-value>)',
          darker: 'rgb(var(--c-darker) / <alpha-value>)',
          dark: 'rgb(var(--c-dark) / <alpha-value>)',
          'dark-2': 'rgb(var(--c-dark-2) / <alpha-value>)',
          sidebar: 'rgb(var(--c-sidebar) / <alpha-value>)',
          'sidebar-active': 'rgb(var(--c-sidebar-active) / <alpha-value>)',
          'sidebar-footer': 'rgb(var(--c-sidebar-footer) / <alpha-value>)',
          gold: 'rgb(var(--c-gold) / <alpha-value>)',
          'gold-light': 'rgb(var(--c-gold-light) / <alpha-value>)',
          'gold-dark': 'rgb(var(--c-gold-dark) / <alpha-value>)',
          muted: 'rgb(var(--c-muted) / <alpha-value>)',
          leaf: 'rgb(var(--c-leaf) / <alpha-value>)',
          'leaf-dark': 'rgb(var(--c-leaf-dark) / <alpha-value>)',
          50: 'rgb(var(--c-brand-50) / <alpha-value>)',
          100: 'rgb(var(--c-brand-100) / <alpha-value>)',
          200: 'rgb(var(--c-brand-200) / <alpha-value>)',
          300: 'rgb(var(--c-brand-300) / <alpha-value>)',
          400: 'rgb(var(--c-brand-400) / <alpha-value>)',
          500: 'rgb(var(--c-brand-500) / <alpha-value>)',
          600: 'rgb(var(--c-brand-600) / <alpha-value>)',
          700: 'rgb(var(--c-brand-700) / <alpha-value>)',
          800: 'rgb(var(--c-brand-800) / <alpha-value>)',
          900: 'rgb(var(--c-brand-900) / <alpha-value>)',
          950: 'rgb(var(--c-brand-950) / <alpha-value>)',
        },
        gold: {
          400: 'rgb(var(--c-gold) / <alpha-value>)',
          500: 'rgb(var(--c-gold-dark) / <alpha-value>)',
          600: 'rgb(var(--c-gold-dark) / <alpha-value>)',
        },
      },
      backgroundImage: {
        'gradient-hero':
          'linear-gradient(135deg, rgb(var(--c-dark)) 0%, rgb(var(--c-darker)) 45%, rgb(var(--c-primary)) 100%)',
        'gradient-primary':
          'linear-gradient(135deg, rgb(var(--c-primary-light)) 0%, rgb(var(--c-primary-dark)) 100%)',
        'gradient-gold':
          'linear-gradient(135deg, rgb(var(--c-gold-light)) 0%, rgb(var(--c-gold-dark)) 100%)',
        'gradient-dark':
          'linear-gradient(180deg, rgb(var(--c-dark)) 0%, rgb(var(--c-darker)) 100%)',
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
