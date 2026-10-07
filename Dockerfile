# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Requis pour Next standalone en conteneur (sinon écoute seulement localhost)
ENV HOSTNAME=0.0.0.0
# Coolify exécute les healthchecks HTTP via curl/wget dans l'image
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system app && useradd --system --gid app app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Binaires ffmpeg/ffprobe (optionalDeps) souvent absents du tracer standalone
COPY --from=builder /app/node_modules/@ffmpeg-installer ./node_modules/@ffmpeg-installer
COPY --from=builder /app/node_modules/@ffprobe-installer ./node_modules/@ffprobe-installer
RUN mkdir -p /app/workspace /app/data && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl --fail --silent --show-error http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
