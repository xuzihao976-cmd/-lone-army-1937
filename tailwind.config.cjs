/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
