/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0B2545',
          50: '#EAF0F8',
          100: '#CBDAEE',
          200: '#9FBADD',
          300: '#6E96C8',
          400: '#4B76AF',
          500: '#2C5591',
          600: '#1C3D6E',
          700: '#132C51',
          800: '#0B2545',
          900: '#071931',
        },
        medblue: {
          DEFAULT: '#1E6FB8',
          50: '#EAF3FB',
          100: '#CDE3F4',
          200: '#9CC7E8',
          300: '#6AAADC',
          400: '#3D8FCE',
          500: '#1E6FB8',
          600: '#175A93',
          700: '#11456F',
        },
        teal: {
          DEFAULT: '#1F8A83',
          50: '#E8F5F4',
          100: '#C7E6E3',
          200: '#9AD1CC',
          300: '#6CBBB4',
          400: '#3FA69C',
          500: '#1F8A83',
          600: '#186E68',
        },
        gold: {
          DEFAULT: '#D98E2B',
          50: '#FBF1E2',
          100: '#F5DFBB',
          400: '#E4A548',
          500: '#D98E2B',
          600: '#B8721C',
        },
        surface: {
          DEFAULT: '#F7F9FB',
          card: '#FFFFFF',
          muted: '#EEF2F6',
          border: '#E2E8F0',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 37, 69, 0.06), 0 4px 12px rgba(11, 37, 69, 0.05)',
        cardHover: '0 2px 6px rgba(11, 37, 69, 0.08), 0 8px 24px rgba(11, 37, 69, 0.08)',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};
