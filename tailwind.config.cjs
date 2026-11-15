/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neutral: { 50: '#faf8f2', 100: '#eae3d4', 200: '#e0d9ca', 300: '#cbc9b8', 400: '#b7b7a7', 500: '#a5ad9b', 600: '#76836e', 700: '#4b5548', 800: '#3c473b', 900: '#202720', 950: '#171c18' },
        amber: { 50: '#fff8e8', 100: '#f0e3c2', 200: '#e1caa2', 300: '#d3b688', 400: '#d3b688', 500: '#d3b688', 600: '#ba9b6c', 700: '#9e855f', 800: '#6b593e', 900: '#493e2d', 950: '#2c291e' },
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
