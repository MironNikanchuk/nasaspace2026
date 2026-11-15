import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [{
      source: "/:path((?!open-direct$).*)",
      has: [{ type: "host", value: "lunawindow-gameover.vercel.app" }],
      missing: [{ type: "cookie", key: "moonsight_direct", value: "1" }],
      destination: "https://nasa.blizzard.guru/:path*",
      permanent: true,
    }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    }];
  },
};

export default config;
