import js from "@eslint/js";
import tseslint from "typescript-eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));
const nodeGlobals = {
	AbortSignal: "readonly",
	Buffer: "readonly",
	console: "readonly",
	process: "readonly",
	Response: "readonly",
	Request: "readonly",
	URL: "readonly",
};

export default tseslint.config(
	{
		ignores: [
			"node_modules/**",
			".plan/**",
			".ruff_cache/**",
			"coverage/**",
			"dist/**",
			"**/__pycache__/**",
			"**/*.pyc",
			"docs/adr/_graph/**",
			"package-lock.json",
		],
	},
	{
		files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
		...js.configs.recommended,
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: nodeGlobals,
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx"],
		extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir,
			},
			globals: nodeGlobals,
		},
		rules: {
			"no-undef": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-confusing-void-expression": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
			"@typescript-eslint/no-unnecessary-condition": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/restrict-template-expressions": [
				"error",
				{ allowBoolean: true, allowNullish: true, allowNumber: true, allowRegExp: true },
			],
		},
	},
	{
		files: ["skills/plan/scripts/manage_jsonl.ts", "tests/manage_jsonl.test.ts"],
		rules: {
			"@typescript-eslint/no-base-to-string": "off",
			"@typescript-eslint/no-unnecessary-template-expression": "off",
			"@typescript-eslint/no-unnecessary-type-conversion": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
		},
	},
);
