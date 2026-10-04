# Next.js storefront. Every shop is served from this one app; the hostname
# picks the merchant (src/middleware.ts).
# Build with the repo root as context: docker build -f apps/storefront/Dockerfile .

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g npm@11.16.0
COPY . .
RUN npm ci
# NEXT_PUBLIC_* values are compiled into the bundle, so they must be present
# at build time. Railway passes service variables to matching ARGs.
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_DEFAULT_REGION=ke
ARG NEXT_PUBLIC_STRIPE_KEY
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
  NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
  NEXT_PUBLIC_DEFAULT_REGION=$NEXT_PUBLIC_DEFAULT_REGION \
  NEXT_PUBLIC_STRIPE_KEY=$NEXT_PUBLIC_STRIPE_KEY \
  NEXT_TELEMETRY_DISABLED=1
RUN cd apps/storefront && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
WORKDIR /app/apps/storefront
EXPOSE 8000
CMD ["sh", "-c", "exec node /app/node_modules/next/dist/bin/next start -p ${PORT:-8000}"]
