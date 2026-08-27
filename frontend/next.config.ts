import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 4 W8: emit a self-contained server bundle so the runtime container
  // carries only the modules actually imported, not the full dependency tree
  // or the build toolchain. Without this the Dockerfile's runtime stage has
  // nothing to copy.
  output: "standalone",
};

export default nextConfig;
