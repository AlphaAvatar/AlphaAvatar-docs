import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // A static export: images are served as files, not through next/image.
  {
    rules: {
      '@next/next/no-img-element': 'off',
      // `({ node, ...props })` drops a prop on purpose.
      '@typescript-eslint/no-unused-vars': ['warn', { ignoreRestSiblings: true }],
    },
  },
  globalIgnores(['.cache/**', '.next/**', 'out/**', 'public/**', 'next-env.d.ts']),
])
