import js from '@eslint/js';
import globals from 'globals';
import tsEslint from 'typescript-eslint';
import checkFile from 'eslint-plugin-check-file';
import stylistic from '@stylistic/eslint-plugin';

// Shared style rules for both JS and TS
const stylisticRules = {
  '@stylistic/array-bracket-spacing': [ 'error', 'always' ],
  '@stylistic/arrow-parens': [ 'error', 'as-needed' ],
  '@stylistic/arrow-spacing': [ 'error', { before: true, after: true } ],
  '@stylistic/block-spacing': [ 'error', 'always' ],
  '@stylistic/brace-style': [ 'error', '1tbs', { allowSingleLine: false } ],
  '@stylistic/comma-dangle': [ 'error', 'never' ],
  '@stylistic/comma-spacing': [ 'error' ],
  '@stylistic/computed-property-spacing': [ 'error', 'never' ],
  '@stylistic/eol-last': [ 'error', 'always' ],
  '@stylistic/function-call-spacing': [ 'error', 'never' ],
  '@stylistic/generator-star-spacing': [ 'error', { before: true, after: false } ],
  '@stylistic/indent': [ 'error', 2 ],
  '@stylistic/key-spacing': [ 'error', { afterColon: true } ],
  '@stylistic/keyword-spacing': [ 'error' ],
  '@stylistic/max-len': [ 'error', { code: 150, tabWidth: 2, comments: Infinity } ],
  '@stylistic/no-mixed-operators': [ 'error' ],
  '@stylistic/no-multi-spaces': [ 'error' ],
  '@stylistic/no-multiple-empty-lines': [ 'error', { max: 1, maxEOF: 1, maxBOF: 0 } ],
  '@stylistic/no-trailing-spaces': [ 'error' ],
  '@stylistic/object-curly-newline': [ 'error', { consistent: true, multiline: true } ],
  '@stylistic/object-curly-spacing': [ 'error', 'always' ],
  '@stylistic/operator-linebreak': [ 'error', 'after' ],
  '@stylistic/quote-props': [ 'error', 'as-needed' ],
  '@stylistic/quotes': [ 'error', 'single' ],
  '@stylistic/semi': [ 'error', 'always' ],
  '@stylistic/space-before-blocks': [ 'error' ],
  '@stylistic/space-before-function-paren': [ 'error', { anonymous: 'always', named: 'never', asyncArrow: 'always' } ],
  '@stylistic/space-in-parens': [ 'error', 'always', { exceptions: [ 'empty' ] } ],
  '@stylistic/space-infix-ops': [ 'error' ],
  '@stylistic/space-unary-ops': [ 'error', { words: true, nonwords: false } ]
};

const restrictedSyntaxList = [
  'DebuggerStatement',
  'Eval',
  'ForInStatement',
  'LabeledStatement',
  'WithStatement',
  { selector: 'VariableDeclaration[kind="let"]', message: 'Using \'let\' is not allowed.' }
];

const syntaxRules = {
  camelcase: [ 'error', { properties: 'never' } ],
  'consistent-return': [ 'error', { treatUndefinedAsUnspecified: true } ],
  curly: [ 'error' ],
  eqeqeq: [ 'error' ],
  'func-names': 0,
  'global-require': [ 'error' ],
  'init-declarations': [ 'error', 'always' ],
  'no-bitwise': [ 'error', { int32Hint: true } ],
  'no-buffer-constructor': [ 'error' ],
  'no-console': 0,
  'no-nested-ternary': [ 'error' ],
  'no-param-reassign': [ 'error' ],
  'no-plusplus': 0,
  'no-regex-spaces': [ 'error' ],
  'no-restricted-syntax': [ 'error', ...restrictedSyntaxList ],
  'no-return-await': [ 'error' ],
  'no-template-curly-in-string': 0,
  'no-undef': [ 'error' ],
  'no-underscore-dangle': 0,
  'no-unused-expressions': [ 'error' ],
  'no-unused-vars': [ 'error', { args: 'all', argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true } ],
  'no-use-before-define': [ 'error' ],
  'no-useless-catch': 0,
  'no-useless-constructor': 1,
  'no-var': [ 'error' ],
  'object-shorthand': [ 'error' ],
  'prefer-const': [ 'error' ],
  'require-atomic-updates': 0
};

// Shared language options
const commonLanguageOptions = {
  parserOptions: {
    ecmaVersion: 2025,
    sourceType: 'module'
  },
  globals: {
    ...globals.node
  }
};

export default [
  {
    ignores: [
      '**/docs/**',
      '**/dist/**',
      '**/temp/**',
      '**/fixtures/**',
      '**/generated/**',
      'sdk/cli/orval.config.ts',
      '**/node_modules/**',
      '**/*.min.js',
      '**/*.yml',
      '**/*.yaml',
      '.github/**/*',
      '.claude/**/*',
      '.agent-os/**/*',
      '**/viz_examples/**',
      '.pnpm-store/**'
    ]
  },

  // File naming convention rules (for all JS/TS files)
  {
    files: [ '**/*.{js,mjs,cjs,ts,tsx}' ],
    plugins: {
      'check-file': checkFile
    },
    rules: {
      // Enforce snake_case for file names
      'check-file/filename-naming-convention': [
        'error',
        {
          '**/*.{js,mjs,cjs,ts,tsx}': 'SNAKE_CASE'
        },
        {
          ignoreMiddleExtensions: true
        }
      ],
      // Enforce snake_case for folder names
      'check-file/folder-naming-convention': [
        'error',
        {
          '**/*': 'SNAKE_CASE'
        }
      ]
    }
  },

  // JavaScript files
  {
    files: [ '**/*.{js,mjs,cjs}' ],
    ...js.configs.recommended,
    languageOptions: commonLanguageOptions,
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      ...syntaxRules,
      ...stylisticRules
    }
  },

  // JS files using import attributes (parser supports; default Espree does not)
  // eg: await import( file, options );
  // @TODO when eslint updates, this can be removed
  {
    files: [ 'sdk/core/src/worker/loader.js' ],
    languageOptions: {
      ...commonLanguageOptions,
      parser: tsEslint.parser,
      parserOptions: {
        ...commonLanguageOptions.parserOptions,
        project: false
      }
    }
  },

  // TypeScript files
  {
    files: [ '**/*.{ts,tsx}' ],
    languageOptions: {
      ...commonLanguageOptions,
      parser: tsEslint.parser,
      parserOptions: {
        ...commonLanguageOptions.parserOptions,
        project: true
      }
    },
    plugins: {
      '@typescript-eslint': tsEslint.plugin,
      '@stylistic': stylistic
    },
    rules: {
      ...tsEslint.configs.recommended.rules,
      ...syntaxRules,
      ...stylisticRules,

      // TypeScript-specific rules and overrides
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Avoid checking TS interfaces since some are defined globally
      'no-undef': 'off',
      'no-unused-vars': 'off'
    }
  },

  // Don't require tsconfig for .d.ts files
  {
    files: [ '**/*.d.ts' ],
    languageOptions: {
      parserOptions: {
        project: false
      }
    }
  },

  // Exceptions for config files and scripts that traditionally use kebab-case
  {
    files: [
      'vitest.*.config.js',
      'vite.config.js',
      'eslint.config.js',
      'prettier.config.js',
      'docker-compose.*.yml',
      '**/bin/*.js',
      '**/*.config.{js,ts}',
      '**/*.spec.{js,ts}',
      '**/*.test.{js,ts}'
    ],
    rules: {
      'check-file/filename-naming-convention': 'off'
    }
  }
];
