/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neutral: { 50: '#faf8f2', 100: '#eee9dd', 200: '#dcd7ca', 300: '#c7c1b5', 400: '#aaa699', 500: '#8f8c81', 600: '#625f55', 700: '#45473e', 800: '#30332d', 900: '#20231e', 950: '#111410' },
        amber: { 50: '#fff8e8', 100: '#f0e3c2', 200: '#ddca9c', 300: '#d4b77b', 400: '#c9a765', 500: '#be9755', 600: '#ac8041', 700: '#896337', 800: '#6b4d30', 900: '#493921', 950: '#2c2418' },
      },
      fontFamily: {
        serif: ['Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Noto Sans Mono CJK SC', 'monospace'],
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out both',
        'slide-up': 'slide-up 260ms ease-out both',
        'bounce-slow': 'bounce 1.8s infinite',
        marquee: 'marquee 18s linear infinite',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-45%)' } },
      },
    },
  },
  plugins: [],
};
