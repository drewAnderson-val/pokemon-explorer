FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
# The FastAPI service's origin, baked into the client bundle at build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Without it every API call goes to this static server and 404s: fail the build.
RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL is required (the API's origin)" && exit 1)
RUN pnpm build

# Static files only: Caddy serves the build (routing rules in Caddyfile).
FROM caddy:2.10.2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
