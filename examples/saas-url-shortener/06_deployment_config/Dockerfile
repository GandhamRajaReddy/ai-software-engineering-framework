# Stage 1: Build & test
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY tests/ ./tests/
COPY server.js ./
RUN node --test tests/shortener.test.js

# Stage 2: Production hardened runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Security: Run as unprivileged node user
USER node

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/server.js ./server.js

EXPOSE 3000

# Built-in health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/healthz || exit 1

CMD ["node", "server.js"]
