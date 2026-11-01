import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native drivers stay as plain Node requires on the server (never bundled for the browser).
  serverExternalPackages: ["pg", "mongodb", "@huggingface/transformers", "onnxruntime-node", "onnxruntime-common", "sharp"],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
