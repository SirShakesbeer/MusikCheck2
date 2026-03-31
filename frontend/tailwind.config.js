/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mc: {
          ink: 'rgb(var(--mc-ink) / <alpha-value>)',
          night: 'rgb(var(--mc-night) / <alpha-value>)',
          surface: 'rgb(var(--mc-surface) / <alpha-value>)',
          panel: 'rgb(var(--mc-panel) / <alpha-value>)',
          cyan: 'rgb(var(--mc-cyan) / <alpha-value>)',
          lime: 'rgb(var(--mc-lime) / <alpha-value>)',
          rose: 'rgb(var(--mc-rose) / <alpha-value>)',
          sun: 'rgb(var(--mc-sun) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Bungee', 'cursive'],
        body: ['Barlow', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(62, 246, 255, 0.28), 0 0 24px rgba(62, 246, 255, 0.25)',
        card: '0 10px 40px rgba(8, 10, 25, 0.42)',
      },
      keyframes: {
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(62, 246, 255, 0.22), 0 0 18px rgba(62, 246, 255, 0.2)' },
          '50%': { boxShadow: '0 0 0 1px rgba(62, 246, 255, 0.45), 0 0 28px rgba(62, 246, 255, 0.35)' },
        },
      },
      animation: {
        floatIn: 'floatIn 300ms ease-out forwards',
        pulseGlow: 'pulseGlow 1600ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

