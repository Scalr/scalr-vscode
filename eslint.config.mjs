import typescriptEslint from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-plugin-prettier';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default [
    {
        ignores: ['**/out', '**/dist', '**/*.d.ts'],
    },
    ...compat.extends(
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended',
        'prettier'
    ),
    {
        plugins: {
            '@typescript-eslint': typescriptEslint,
            prettier,
        },

        languageOptions: {
            globals: {
                console: 'readonly',
                __dirname: 'readonly',
                module: 'readonly',
                require: 'readonly',
            },

            parser: tsParser,
            ecmaVersion: 6,
            sourceType: 'module',
        },

        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase'],
                },
            ],
            curly: 'warn',
            'no-throw-literal': 'warn',
            semi: ['error', 'always'],

            quotes: [
                'error',
                'single',
                {
                    avoidEscape: true,
                },
            ],

            indent: [
                'error',
                4,
                {
                    SwitchCase: 1,
                },
            ],

            'no-unused-vars': 'off',
            eqeqeq: ['error', 'always'],
            'no-console': 'warn',
            'prettier/prettier': ['error'],
        },
    },
];
