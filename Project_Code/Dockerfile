# QuestForge - one container: Express + the built Phaser game + the native
# C/C++ engines (compiled for Linux here).
#
#   docker build -t questforge .
#   docker run -p 3001:3001 -e MONGODB_URI="..." questforge
#
# Hosts such as Render / Railway / Fly.io set PORT; the server listens on it.
# Secrets (MONGODB_URI) are set in the host's dashboard - never baked into the image.

# ---- build: compile the engines, bundle the frontend -------------------------
FROM node:22-bookworm-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ libc6-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node native/build.mjs \
    && npx vite build \
    && npm prune --omit=dev

# ---- run: only what the server needs ----------------------------------------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    QUESTFORGE_TRUST_PROXY=1
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
# the server shares the scoring rules with the browser
COPY --from=build /app/src/data ./src/data
COPY --from=build /app/native/bin ./native/bin
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
CMD ["sh", "-c", "QUESTFORGE_API_PORT=${PORT:-3001} exec node server/server.js"]
