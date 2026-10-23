import importPlugin from 'eslint-plugin-import';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextCoreWebVitals,
  { plugins: { import: importPlugin } },
  {
    ignores: [
      '.next/**',
      '.vercel/**',
      'build/**',
      'dist/**',
      'worker-configuration.d.ts',
      'node_modules/**',
      '**/.wrangler/**',
      '**/.migration/**',
      'data-service/worker-configuration.d.ts',
      'out/**',
      'public/sw.js',
      'next-env.d.ts',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    rules: {
      'camelcase': 'off',
      'import/no-anonymous-default-export': 'off',
      'import/prefer-default-export': 'off',
      'react/jsx-filename-extension': 'off',
      'react/jsx-props-no-spreading': 'off',
      'react/no-unused-prop-types': 'off',
      'react/require-default-props': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'jsx-a11y/alt-text': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'import/extensions': [
        'warn',
        'ignorePackages',
        {
          ts: 'never',
          tsx: 'never',
          js: 'never',
          jsx: 'never',
        },
      ],
    },
  },
  {
    files: ['scripts/d1/*.mjs'],
    rules: { 'import/extensions': ['warn', 'ignorePackages', { ts: 'always' }] },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
