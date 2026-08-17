# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx tsc

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
RUN sed -i 's/\r$//' /app/deploy/docker-entrypoint.sh \
  && chmod +x /app/deploy/docker-entrypoint.sh \
  && mkdir -p storage/local-upload-mock/investment-ops-reports
EXPOSE 3009
HEALTHCHECK --interval=20s --timeout=5s --start-period=90s --retries=8 \
  CMD curl -fsS http://127.0.0.1:${PORT:-3009}/health || exit 1
ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]
CMD ["node", "dist/app.js"]
