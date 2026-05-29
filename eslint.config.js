import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowHigherOrderFunctions: true }
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'id-length': [
        'error',
        { min: 2, exceptions: ['i', 'j', 'k'], properties: 'never' }
      ],
      curly: ['error', 'all'],
      'no-implicit-coercion': ['error', { boolean: true }]
    }
  }
];
