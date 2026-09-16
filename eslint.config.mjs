import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'out/**', 'coverage/**', 'node_modules/**', '.vscode-test/**'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      'no-console': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/domain/**', 'src/util/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: 'vscode', message: 'domain/ and util/ must not import vscode' }] }],
    },
  },
  { files: ['**/*.mjs'], ...tseslint.configs.disableTypeChecked },
);
