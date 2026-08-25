import type { NextConfig } from "next";

/**
 * Two build modes from one codebase — Phase 4 W8/W9.
 *
 * `standalone` (default) emits a self-contained Node server for the Docker
 * image and for Vercel.
 *
 * `export` (NEXT_OUTPUT=export) emits plain static HTML/JS for Capacitor to
 * bundle into the Android app, which has no Node runtime.
 *
 * Both modes build the same routes because Phase 4 W9 moved every
 * record-scoped page from a dynamic path segment to a query parameter — see
 * lib/routes.ts. Without that, `export` would fail on the first
 * `[id]` route it met, since Rydr's ids are runtime UUIDs and there is no
 * build-time list to prerender.
 *
 * The mode is an environment variable rather than two config files so the two
 * cannot drift: everything except `output` and image handling is shared.
 */
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  output: isExport ? "export" : "standalone",

  // Static export has no server, so Next's image optimizer cannot run.
  // Rydr serves user media straight from Cloudinary, which does its own
  // format negotiation and resizing (see backend services/media_urls), so
  // there is nothing lost here beyond the built-in optimizer.
  images: { unoptimized: true },

  // Emit `/feed/index.html` rather than `/feed.html`. Capacitor serves the
  // bundle from the filesystem, where directory-style paths resolve without
  // rewrite rules.
  ...(isExport ? { trailingSlash: true } : {}),
};

export default nextConfig;
