/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        peach: { DEFAULT: '#F2D9CE', 50: '#FBF3EF', 100: '#F8EAE3', 200: '#F2D9CE', 300: '#EBC8B9', 400: '#D9A995' },
        clay: { DEFAULT: '#A87967', dark: '#8E6352', deep: '#5E3F33' },
        ink: '#17110E',
      },
      fontFamily: { sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(94,63,51,.06), 0 8px 30px rgba(94,63,51,.06)' },
    },
  },
  plugins: [],
};
