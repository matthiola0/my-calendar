import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const useEffectMessage = 'Do not use React useEffect.';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'react', importNames: ['useEffect'], message: useEffectMessage }],
      }],
      'no-restricted-syntax': ['error', {
        selector: [
          'CallExpression[callee.name="useEffect"]',
          'MemberExpression[computed=false][property.name="useEffect"]',
          'MemberExpression[property.value="useEffect"]',
          'ObjectPattern > Property[computed=false][key.name="useEffect"]',
          'ObjectPattern > Property[key.value="useEffect"]',
        ].join(', '),
        message: useEffectMessage,
      }],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
