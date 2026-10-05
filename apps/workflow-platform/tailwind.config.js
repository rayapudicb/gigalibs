const path = require('path');

module.exports = {
  presets: [require('@medusajs/ui-preset')],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    // Module screens and shared React packages render inside this app; without these globs their classes are never
    // generated (WI-OI-120b).
    '../../modules/*/web/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/*-react/src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@medusajs/ui/dist/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
