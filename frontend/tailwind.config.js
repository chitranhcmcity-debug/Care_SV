/** @type {import('tailwindcss').Config} */
// Berry-style theme (moved from the CDN config in index.html).
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      colors: {
        blue: {
          50: '#e3f2fd',
          100: '#bbdefb',
          200: '#90caf9',
          300: '#64b5f6',
          400: '#42a5f5',
          500: '#2196f3',
          600: '#1e88e5',
          700: '#1976d2',
          800: '#1565c0',
          900: '#0d47a1',
          950: '#0a3677',
        },
        // Accent colour: CSS variables so the admin's primary colour re-themes the app
        // at runtime (BrandingService); defaults live in styles.css.
        violet: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          950: 'rgb(var(--brand-950) / <alpha-value>)',
        },
        slate: {
          50: '#f8fafc',
          100: '#eef2f6',
          200: '#e3e8ef',
          300: '#cdd5df',
          400: '#9aa4b2',
          500: '#697586',
          600: '#4b5565',
          700: '#364152',
          800: '#202939',
          900: '#121926',
          950: '#0d121c',
        },
      },
      fontWeight: { extrabold: '700', black: '700' },
      borderRadius: { '2xl': '12px', '3xl': '16px' },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(32, 40, 45, 0.04)',
        DEFAULT: '0 2px 14px 0 rgba(32, 40, 45, 0.08)',
        lg: '0 8px 24px 0 rgba(32, 40, 45, 0.08)',
        xl: '0 12px 32px 0 rgba(32, 40, 45, 0.12)',
      },
    },
  },
};
