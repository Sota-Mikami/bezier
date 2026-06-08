import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so Tauri can serve the frontend from ../out as files.
  output: "export",
  // next/image optimization requires a server; disable for static export.
  images: { unoptimized: true },
  // NOTE: do not set basePath/assetPrefix — Tauri serves from the app root.
};

export default nextConfig;
