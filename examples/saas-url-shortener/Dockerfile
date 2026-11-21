# Stage 1: Build, install dependencies & test
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY public/ ./public/
COPY tests/ ./tests/
COPY server.js ./
RUN npm test

# Stage 2: Production hardened runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Security: Run as unprivileged node user
USER node

COPY --chown=node:node src/ ./src
COPY --chown=node:node public/ ./public
COPY --chown=node:node server.js ./server.js

EXPOSE 3000

# Built-in readiness health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/readyz || exit 1

CMD ["node", "server.js"]
