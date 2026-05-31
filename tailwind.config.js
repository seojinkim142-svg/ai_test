/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ponder: {
          bg: '#FBFBF9',
          fg: '#0A0A0A',
          blue: '#006FEE',
          muted: '#666666',
          border: '#E5E5E0',
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'sans-serif'],
        display: ['Manrope', 'Geist', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      }
    }
  },
  plugins: [],
}
