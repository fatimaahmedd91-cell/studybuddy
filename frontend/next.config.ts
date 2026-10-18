import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Tailwind runs as a Turbopack loader for every CSS file.
// root: this folder is the project, even though the repo root has its own package-lock.json.
const shared: NextConfig = {
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// While you develop (`npm run dev`), calls to /api/... are forwarded to the Python backend
// on port 8000, so the browser only ever talks to one address.
// For the live site (`npm run build`), Next.js exports plain HTML/CSS/JS into the `out`
// folder. On the server, Caddy serves those files and sends /api/... to the backend.
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
    return {
      ...shared,
      // No Next.js badge: on phones it sits on top of the tab bar's "More" button.
      devIndicators: false,
      // Codespaces opens the dev site on a *.app.github.dev address.
      allowedDevOrigins: ["*.app.github.dev"],
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
      },
    };
  }
  return { ...shared, output: "export", images: { unoptimized: true } };
}
