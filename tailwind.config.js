/** @type {import('tailwindcss').Config} */
// Diez Mail 2.0 design tokens.
// The `gallery-*` names are kept from 1.x so untouched screens (Mail) adopt
// the new palette without edits. `signal-*` is a five-step scale for how
// strong an engagement signal is: from a single open (faint) to an inquiry
// (the one accent colour). Nothing else in the UI uses the accent.
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Replica', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Replica', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        gallery: {
          black: '#171717',
          dark: '#2b2a28',
          mid: '#6f6c66',
          light: '#a8a49c',
          border: '#e6e3dd',
          bg: '#f7f6f3',
          white: '#ffffff',
          accent: '#c45a3c',
          'accent-light': '#f6e9e4',
          success: '#3f7a4c',
          'success-light': '#e8f0e9',
          warn: '#a8772a',
          'warn-light': '#f7efe0',
          danger: '#b3412f',
          'danger-light': '#f8e8e5',
        },
        signal: {
          1: '#d9d5cd', // open
          2: '#a8a49c', // click / pdf
          3: '#6f6c66', // viewing room
          4: '#171717', // artwork / long visit
          5: '#c45a3c', // inquiry
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        pop: '0 12px 32px -12px rgba(23,23,23,0.25)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
