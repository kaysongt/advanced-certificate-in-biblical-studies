import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  // content/ and curriculum.json are read from the repo root at build time,
  // so they must be traced into the deployment bundle.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*", "./curriculum.json"],
  },
};

export default nextConfig;
