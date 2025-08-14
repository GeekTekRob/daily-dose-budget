/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // From color-scheme.css (wired through CSS variables in styles.css)
        seasalt: 'var(--seasalt)',
        ink: 'var(--black)',
        emerald: 'var(--emerald)',
        redPantone: 'var(--red-pantone)',
        mardiGras: 'var(--mardi-gras)',
      },
    },
  },
  plugins: [],
}
