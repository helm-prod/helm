import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0F2F5',
          100: '#DEE6EE',
          200: '#C4D2E0',
          300: '#8FA8BF',
          400: '#4A9BD9',
          500: '#2E79B3',
          600: '#1B5D95',
          700: '#00477A',
          800: '#003A68',
          900: '#003057',
          950: '#001F3A',
        },
        gold: {
          50: '#FDF8ED',
          100: '#F9ECCC',
          200: '#F2D999',
          300: '#E8C166',
          400: '#CFA751',
          500: '#B8912E',
          600: '#9A7624',
          700: '#7C5D1D',
          800: '#5E4516',
          900: '#3F2E0F',
          950: '#1F1708',
        },
        nex: {
          navy: '#003057',
          navyLight: '#00477A',
          red: '#CE1A2E',
          redDark: '#A40025',
          white: '#FFFFFF',
          pale: '#F0F2F5',
          gold: '#CFA751',
          goldDark: '#B8912E',
          goldLight: '#E0C878',
          ink: '#1A1A2E',
          link: '#CFA751',
        },
      },
    },
  },
  plugins: [],
}
export default config
