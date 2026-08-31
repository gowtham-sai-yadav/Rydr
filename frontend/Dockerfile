# Rydr web frontend — Phase 4 W8.
#
# Next.js standalone output: the build emits a self-contained server bundle
# with only the node_modules it actually imports, so the runtime image does
# not carry the full dependency tree or the build toolchain.

# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Copy only the manifests first: this layer is cached and rebuilt only when
# dependencies change, not on every source edit.
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, not read at runtime, so the
# API URL has to be supplied here. A staging image and a production image are
# therefore genuinely different builds — worth knowing before wondering why
# changing the variable in compose had no effect.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Opt in to the self-contained server bundle. This is set here rather than
# defaulted in next.config.ts because Vercel needs `output` left unset - it
# builds its own serverless output and reads the .nft.json trace manifests
# that standalone mode does not emit.
ENV NEXT_OUTPUT=standalone

RUN npm run build

# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # Next's standalone server.js reads HOSTNAME to decide what to bind to,
    # and with it unset it binds to whatever the container hostname resolves
    # to — 172.x.y.z, not 0.0.0.0. Published ports still work from outside,
    # so the site looks fine, but nothing *inside* the container can reach
    # localhost:3000, which silently breaks the healthcheck below and any
    # in-container probe an orchestrator runs.
    HOSTNAME=0.0.0.0

RUN addgroup -g 10001 -S rydr && adduser -u 10001 -S rydr -G rydr

COPY --from=builder --chown=rydr:rydr /app/public ./public
COPY --from=builder --chown=rydr:rydr /app/.next/standalone ./
COPY --from=builder --chown=rydr:rydr /app/.next/static ./.next/static

USER rydr
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
