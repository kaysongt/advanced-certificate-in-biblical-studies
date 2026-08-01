import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "assets/**", "docs/**", "node_modules/**", "next-env.d.ts"]),
  {
    rules: {
      // Curriculum records deliberately use the domain name `module`.
      "@next/next/no-assign-module-variable": "off",
    },
  },
]);
