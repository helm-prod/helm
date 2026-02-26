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
        nex: {
          navy: '#003057',
          navyLight: '#00477A',
          red: '#C8102E',
          redDark: '#A40D25',
          white: '#FFFFFF',
          pale: '#F0F2F5',
          gold: '#C5960C',
          ink: '#1A1A2E',
          link: '#4A9BD9',
        },
      },
    },
  },
  plugins: [],
}
export default config
