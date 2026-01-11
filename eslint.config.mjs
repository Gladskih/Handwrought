import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const sharedRules = {
  "prefer-const": "error",
  "no-var": "error",
  "max-len": [
    "error",
    {
      code: 120,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
      ignoreComments: true
    }
  ],
  "max-lines": [
    "error",
    {
      max: 300,
      skipComments: true
    }
  ]
};

const tsRuleOverrides = {
  "no-unused-vars": "off",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      args: "all",
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrors: "none"
    }
  ],
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-ignore": true,
      "ts-nocheck": true,
      "ts-check": false,
      "ts-expect-error": "allow-with-description",
      minimumDescriptionLength: 5
    }
  ],
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/consistent-type-imports": [
    "error",
    {
      prefer: "type-imports",
      fixStyle: "separate-type-imports"
    }
  ]
};

/** @type {import("eslint").FlatConfig[]} */
export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser
      }
    },
    rules: sharedRules
  },
  {
    files: ["**/*.ts"],
    ignores: ["vite.config.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.json"
      },
      globals: {
        ...globals.browser
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...sharedRules,
      ...tsRuleOverrides
    }
  },
  {
    files: ["vite.config.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: "./tsconfig.node.json"
      },
      globals: {
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...sharedRules,
      ...tsRuleOverrides
    }
  },
  {
    ignores: ["dist/**", "coverage/**", "test-results/**"]
  }
];
