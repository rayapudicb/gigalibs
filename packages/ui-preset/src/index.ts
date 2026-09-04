/**
 * @gigalibs/ui-preset
 *
 * Tailwind CSS configuration preset for Giga UI.
 * Provides custom color tokens, font hierarchy, shadows, and radii.
 *
 * @module
 */

export const gigaUiPreset = {
  theme: {
    extend: {
      colors: {
        giga: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        primary: {
          DEFAULT: '#2563eb',
          foreground: '#ffffff',
          hover: '#1d4ed8',
        },
        accent: {
          DEFAULT: '#8b5cf6',
          foreground: '#ffffff',
        },
        success: {
          DEFAULT: '#10b981',
          foreground: '#ffffff',
        },
        warning: {
          DEFAULT: '#f59e0b',
          foreground: '#ffffff',
        },
        danger: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
      },
      borderRadius: {
        'giga': '8px',
        'giga-lg': '12px',
      },
    },
  },
};

export default gigaUiPreset;
