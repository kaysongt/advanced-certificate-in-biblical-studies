/** @type {import('next').NextConfig} */
const nextConfig = {
  // content/ and curriculum.json are read from the repo root at build time,
  // so they must be traced into the deployment bundle.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*", "./curriculum.json"],
  },
};

export default nextConfig;
