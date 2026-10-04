# Medusa backend: API plus the merchant admin at /app.
# Build with the repo root as context so the npm workspace and root lockfile
# resolve: docker build -f apps/backend/Dockerfile .

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g npm@11.16.0
COPY . .
RUN npm ci
RUN cd apps/backend && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV MEDUSA_DISABLE_TELEMETRY=true
COPY --from=build /app /app
# medusa build writes the runnable app to .medusa/server. It resolves its
# packages from the workspace node_modules above it, so no second install.
# Uploads land in ./static here; mount a persistent volume on that path.
WORKDIR /app/apps/backend/.medusa/server
EXPOSE 9000
CMD ["/app/node_modules/.bin/medusa", "start"]
