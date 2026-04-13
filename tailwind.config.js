/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['DM Sans', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
      },
      colors: {
        gallery: {
          black: '#1a1a1a',
          dark: '#2d2d2d',
          mid: '#6b6b6b',
          light: '#b0b0b0',
          border: '#e0e0e0',
          bg: '#fafafa',
          white: '#ffffff',
          accent: '#c45a3c',
          'accent-light': '#f4e8e4',
          success: '#3a7d44',
          warn: '#d4a03c',
        },
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '0.9rem' }],
      },
    },
  },
  plugins: [],
};
