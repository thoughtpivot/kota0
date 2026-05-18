# Per-app bundle image. Built by the workspace's LocalDockerTarget on Deploy.
#
# Build context = `bundles/<appId>/` after writeKota0AppBundle has populated it
# (App.vue, App.backend.ts, package.json, .env, vite config, etc.).
#
# Runtime env (gateway URL, SCRIBE_API_KEY, K0_APP_REDIS_PREFIX, K0_APP_ID,
# K0_PLATFORM_API_ORIGIN) is injected at `docker run` time — never baked in.

# ----- builder: install + vite build -----
FROM node:22-bookworm-slim AS builder

WORKDIR /bundle

# Install only what package.json needs. Bundle deps mirror workspace deps;
# `npm install` (not `ci`) because there's no lockfile inside bundles/.
COPY package.json ./
RUN npm install --no-audit --no-fund --loglevel=warn

# Sources + Vite config + bundle scaffold from templates/k0-bundle/.
COPY . .

RUN npm run build

# ----- runtime: Flight in production mode -----
FROM node:22-bookworm-slim AS runtime

WORKDIR /bundle

ENV NODE_ENV=production \
    FLIGHT_MODE=production \
    FLIGHT_DISABLE_VITE=true \
    FLIGHT_MAX_WORKERS=1 \
    FLIGHT_DIST_PATH=./dist \
    FLIGHT_PORT=4000

COPY --from=builder /bundle/node_modules ./node_modules
COPY --from=builder /bundle/dist ./dist
COPY --from=builder /bundle/package.json ./package.json
COPY --from=builder /bundle/App.backend.ts ./App.backend.ts
COPY --from=builder /bundle/tsconfig.json ./tsconfig.json

EXPOSE 4000

# Match `start:app` in the workspace package.json: tsx + tsconfig-paths + Flight.
CMD ["node", "--disable-warning=DEP0040", \
     "./node_modules/tsx/dist/cli.mjs", \
     "-r", "tsconfig-paths/register", \
     "./node_modules/@thoughtpivot/flight/src/flight.ts", \
     "--mode", "production", "--app_home", "."]
