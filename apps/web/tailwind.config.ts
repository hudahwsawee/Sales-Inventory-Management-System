import type { Config } from 'tailwindcss';

// دعم RTL كامل — الواجهة عربية أولًا (قرار معتمد صراحة)
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', '"Tajawal"', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-rtl')],
} satisfies Config;
