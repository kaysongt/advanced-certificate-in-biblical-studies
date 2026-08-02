import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  // content/ and curriculum.json are read from the repo root at build time,
  // so they must be traced into the deployment bundle.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*", "./curriculum.json"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
    ];
  },
};

export default nextConfig;
