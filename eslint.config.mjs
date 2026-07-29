import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "assets/**", "docs/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    rules: {
      // The content domain deliberately calls curriculum records `module`.
      // These are ESM/TypeScript files and do not shadow CommonJS module.exports.
      "@next/next/no-assign-module-variable": "off",
    },
  },
];

export default config;
