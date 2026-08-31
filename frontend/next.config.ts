import type { NextConfig } from "next";

/**
 * Three build targets from one codebase.
 *
 *   NEXT_OUTPUT=export      static HTML/JS for Capacitor to bundle into the
 *                           Android app, which has no Node runtime
 *   NEXT_OUTPUT=standalone  self-contained Node server for the Docker image
 *   unset                   Next's default, which is what Vercel expects
 *
 * The default deliberately sets no `output`. Vercel builds its own serverless
 * output and its post-build step reads the Node file-trace manifests
 * (`.next/*.nft.json`); `output: "standalone"` does not emit those, so forcing
 * it here failed every Vercel build with:
 *
 *   ENOENT: no such file or directory, open '.../.next/next-server.js.nft.json'
 *
 * Docker therefore opts in explicitly (see frontend/Dockerfile) rather than
 * relying on a default that only suits one of the three targets.
 *
 * All three build the same routes, because every record-scoped page takes its
 * id from a query parameter rather than a path segment (see lib/routes.ts).
 * Without that, `export` would fail on the first `[id]` route it met: Rydr's
 * ids are runtime UUIDs with no build-time list to prerender.
 */
const mode = process.env.NEXT_OUTPUT;
const isExport = mode === "export";

const nextConfig: NextConfig = {
  ...(isExport
    ? { output: "export" as const }
    : mode === "standalone"
      ? { output: "standalone" as const }
      : {}),

  // The static export has no server, so Next's image optimizer cannot run.
  // Left off everywhere for consistency: user media comes from Cloudinary,
  // which already does its own format negotiation and resizing (see the
  // backend's services/media_urls), so little is lost.
  images: { unoptimized: true },

  // Emit `/feed/index.html` rather than `/feed.html`. Capacitor serves the
  // bundle off the filesystem, where directory-style paths resolve without
  // rewrite rules.
  ...(isExport ? { trailingSlash: true } : {}),
};

export default nextConfig;
