/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tea: {
          50: '#FDFBF7',
          100: '#F8F3E8',
          200: '#EFE5CE',
          300: '#E2D0A9',
          400: '#D1B37B',
          500: '#C19A5B',
          600: '#A67C46',
          700: '#856038',
          800: '#6D4F32',
          900: '#5A412B',
        },
        matcha: {
          50: '#F4F8F2',
          100: '#E5F0E0',
          200: '#CCE1C3',
          300: '#A5C997',
          400: '#78AB66',
          500: '#578E45',
          600: '#437134',
          700: '#365A2B',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      animation: {
        'spin-slow': 'spin 12s linear infinite',
        'float-up': 'floatUp 3.2s ease-out forwards',
      },
      keyframes: {
        floatUp: {
          '0%': { transform: 'translateY(0) scale(0.7)', opacity: '0' },
          '15%': { transform: 'translateY(-30px) scale(1.15)', opacity: '1' },
          '80%': { transform: 'translateY(-180px) scale(1)', opacity: '0.9' },
          '100%': { transform: 'translateY(-240px) scale(0.8)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
