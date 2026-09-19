import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The migration runner (db/index.ts) reads ./drizzle/*.sql from disk at
  // request time via fs.readFileSync, not via import/require — Next's file
  // tracing only follows imports, so without this the folder would be
  // silently dropped from the Vercel serverless function bundle and every
  // DB-touching route would fail at runtime with ENOENT.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**"],
  },
};

export default nextConfig;
