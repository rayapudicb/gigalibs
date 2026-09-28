# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

# Pulled and inspected on 2026-09-23: Node v24.21.0 builder, Debian 12, linux/arm64.
# The shipped containers use the separately pinned shell-free distroless runtime below.
# Changing either digest requires rebuilding, rescanning and rerunning LOCAL-2 evidence.
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build-base

USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates=20250419~deb12u1 \
      openssl=3.0.20-1~deb12u2 && \
    rm -rf /var/lib/apt/lists/*

FROM build-base AS migrations-build

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY package.json pnpm-lock.yaml ./
COPY infra/compose/docker/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY packages/db-migrations-runtime/package.json ./packages/db-migrations-runtime/package.json
COPY packages/db-migrations-runtime/prisma.config.mjs ./packages/db-migrations-runtime/prisma.config.mjs
RUN --mount=type=cache,id=gigalibs-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm config set fetch-timeout 600000 && \
    pnpm config set fetch-retries 5 && \
    pnpm config set network-concurrency 8 && \
    pnpm install --frozen-lockfile --prod --no-optional \
      --filter @gigalibs/db-migrations-runtime...
RUN pnpm --filter @gigalibs/db-migrations-runtime deploy --prod --no-optional --legacy /output/migrations
COPY packages/db/schema.prisma /output/migrations/database/schema.prisma
COPY packages/db/migrations/ /output/migrations/database/migrations/
RUN find /output -type f \( -name '.env' -o -name '.env.*' \) -delete && \
    test -z "$(find /output -type f \( -name '.env' -o -name '.env.*' \) -print -quit)"

FROM build-base AS build

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY . .
COPY infra/compose/docker/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=gigalibs-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm config set fetch-timeout 600000 && \
    pnpm config set fetch-retries 5 && \
    pnpm config set network-concurrency 8 && \
    pnpm install --frozen-lockfile \
      --filter @gigalibs/app-playground-api... \
      --filter @gigalibs/workflow-platform...
RUN pnpm --recursive --workspace-concurrency=1 \
      --filter @gigalibs/app-playground-api... \
      --filter @gigalibs/workflow-platform^... \
      --filter '!@gigalibs/data-import-export-react' \
      run clean
RUN pnpm --recursive --sort --workspace-concurrency=1 \
      --filter @gigalibs/app-playground-api... \
      --filter @gigalibs/workflow-platform^... \
      --filter '!@gigalibs/data-import-export-react' \
      run build && \
    pnpm --filter @gigalibs/workflow-platform run build
RUN pnpm --filter @gigalibs/app-playground-api deploy --prod --legacy /output/api
RUN pnpm --filter @gigalibs/workflow-platform deploy --prod --legacy /output/web
RUN find /output -type f \( -name '.env' -o -name '.env.*' \) -delete && \
    test -z "$(find /output -type f \( -name '.env' -o -name '.env.*' \) -print -quit)"

FROM build-base AS module-build

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
COPY . .
COPY infra/compose/docker/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=gigalibs-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm config set fetch-timeout 600000 && \
    pnpm config set fetch-retries 5 && \
    pnpm config set network-concurrency 8 && \
    pnpm install --frozen-lockfile \
      --filter @gigalibs/connectors-api... \
      --filter @gigalibs/analytics-api... \
      --filter @gigalibs/gigaops-api... \
      --filter @gigalibs/geospatial-api... \
      --filter @gigalibs/cmms-api...
RUN pnpm --recursive --sort --workspace-concurrency=1 \
      --filter @gigalibs/connectors-api... \
      --filter @gigalibs/analytics-api... \
      --filter @gigalibs/gigaops-api... \
      --filter @gigalibs/geospatial-api... \
      --filter @gigalibs/cmms-api... \
      run build
RUN pnpm --filter @gigalibs/connectors-api deploy --prod --legacy /output/connector-hub-api && \
    pnpm --filter @gigalibs/analytics-api deploy --prod --legacy /output/analytics-api && \
    pnpm --filter @gigalibs/gigaops-api deploy --prod --legacy /output/workforce-api && \
    pnpm --filter @gigalibs/geospatial-api deploy --prod --legacy /output/geospatial-api && \
    pnpm --filter @gigalibs/cmms-api deploy --prod --legacy /output/cmms-api
# WI-OI-038: CMMS installs only the ordered runtime manifest, never the prototype migrations beside it.
RUN mkdir -p /output/cmms-api/migrations && \
    grep -Ev '^(#|$)' modules/physical-operations-cmms/db/runtime-manifest.txt | \
      while read -r migration; do cp "modules/physical-operations-cmms/db/migrations/${migration}" /output/cmms-api/migrations/; done && \
    test "$(ls /output/cmms-api/migrations | wc -l)" -eq "$(grep -Evc '^(#|$)' modules/physical-operations-cmms/db/runtime-manifest.txt)" && \
    cp infra/compose/docker/run-module-migrations.mjs /output/cmms-api/
RUN mkdir -p /output/connector-hub-api/migrations /output/analytics-api/migrations /output/workforce-api/migrations /output/geospatial-api/migrations && \
    cp modules/universal-connector-hub/db/migrations/*.up.sql /output/connector-hub-api/migrations/ && \
    cp modules/analytics-studio/db/migrations/*.up.sql /output/analytics-api/migrations/ && \
    cp modules/gigaops/db/runtime-foundation/*.up.sql /output/workforce-api/migrations/ && \
    cp modules/geospatial/db/runtime-foundation/*.up.sql /output/geospatial-api/migrations/ && \
    cp infra/compose/docker/run-module-migrations.mjs /output/connector-hub-api/ && \
    cp infra/compose/docker/run-module-migrations.mjs /output/analytics-api/ && \
    cp infra/compose/docker/run-module-migrations.mjs /output/workforce-api/ && \
    cp infra/compose/docker/run-module-migrations.mjs /output/geospatial-api/ && \
    find /output -type f \( -name '.env' -o -name '.env.*' \) -delete && \
    test -z "$(find /output -type f \( -name '.env' -o -name '.env.*' \) -print -quit)"

FROM gcr.io/distroless/nodejs24-debian13@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS api
ARG SOURCE_REVISION
ARG SOURCE_STATE_SHA256
LABEL org.opencontainers.image.title="GigaLibs control-plane API" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.gigalibs.source-state-sha256="${SOURCE_STATE_SHA256}" \
      com.gigalibs.component="api" \
      com.gigalibs.profile-key="configuration-local-development-v1"
ENV NODE_ENV=production
ENV PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY --from=build --chown=65532:65532 /output/api/ ./
USER 65532:65532
EXPOSE 3333
CMD ["dist/main.js"]

FROM gcr.io/distroless/nodejs24-debian13@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS web
ARG SOURCE_REVISION
ARG SOURCE_STATE_SHA256
LABEL org.opencontainers.image.title="GigaLibs workflow platform web" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.gigalibs.source-state-sha256="${SOURCE_STATE_SHA256}" \
      com.gigalibs.component="web" \
      com.gigalibs.profile-key="configuration-local-development-v1"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY --from=build --chown=65532:65532 /output/web/ ./
USER 65532:65532
EXPOSE 5180
CMD ["node_modules/next/dist/bin/next", "start", "--port", "5180", "--hostname", "0.0.0.0"]

FROM gcr.io/distroless/nodejs24-debian13@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS migrations
ARG SOURCE_REVISION
ARG SOURCE_STATE_SHA256
LABEL org.opencontainers.image.title="GigaLibs control-plane migrations" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.gigalibs.source-state-sha256="${SOURCE_STATE_SHA256}" \
      com.gigalibs.component="migrations" \
      com.gigalibs.profile-key="configuration-local-development-v1"
ENV NODE_ENV=production
ENV PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY --from=migrations-build --chown=65532:65532 /output/migrations/ ./
USER 65532:65532
CMD ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma.config.mjs"]

FROM gcr.io/distroless/nodejs24-debian13@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS connector-hub-api
ARG SOURCE_REVISION
ARG SOURCE_STATE_SHA256
LABEL org.opencontainers.image.title="GigaLibs Connector Hub API" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.gigalibs.source-state-sha256="${SOURCE_STATE_SHA256}" \
      com.gigalibs.component="connector-hub-api" \
      com.gigalibs.profile-key="module-runtime-local-development-v1"
ENV NODE_ENV=development
ENV PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY --from=module-build --chown=65532:65532 /output/connector-hub-api/ ./
USER 65532:65532
EXPOSE 4100
CMD ["dist/main.js"]

FROM gcr.io/distroless/nodejs24-debian13@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS analytics-api
ARG SOURCE_REVISION
ARG SOURCE_STATE_SHA256
LABEL org.opencontainers.image.title="GigaLibs Analytics API" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.gigalibs.source-state-sha256="${SOURCE_STATE_SHA256}" \
      com.gigalibs.component="analytics-api" \
      com.gigalibs.profile-key="module-runtime-local-development-v1"
ENV NODE_ENV=development
ENV PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY --from=module-build --chown=65532:65532 /output/analytics-api/ ./
USER 65532:65532
EXPOSE 4400
CMD ["dist/main.js"]

FROM gcr.io/distroless/nodejs24-debian13@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS workforce-api
ARG SOURCE_REVISION
ARG SOURCE_STATE_SHA256
LABEL org.opencontainers.image.title="GigaLibs GigaOps Workforce API" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.gigalibs.source-state-sha256="${SOURCE_STATE_SHA256}" \
      com.gigalibs.component="workforce-api" \
      com.gigalibs.work-item="WI-OI-061" \
      com.gigalibs.profile-key="workforce-runtime-local-development-v1"
ENV NODE_ENV=development
ENV PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY --from=module-build --chown=65532:65532 /output/workforce-api/ ./
USER 65532:65532
EXPOSE 4700
CMD ["dist/main.js"]

FROM gcr.io/distroless/nodejs24-debian13@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS geospatial-api
ARG SOURCE_REVISION
ARG SOURCE_STATE_SHA256
LABEL org.opencontainers.image.title="GigaLibs Geospatial API" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.gigalibs.source-state-sha256="${SOURCE_STATE_SHA256}" \
      com.gigalibs.component="geospatial-api" \
      com.gigalibs.work-item="WI-OI-063" \
      com.gigalibs.profile-key="geospatial-runtime-local-development-v1"
ENV NODE_ENV=development
ENV PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY --from=module-build --chown=65532:65532 /output/geospatial-api/ ./
USER 65532:65532
EXPOSE 4720
CMD ["dist/main.js"]

FROM gcr.io/distroless/nodejs24-debian13@sha256:bb6b03d81066993293a10feda7250e8e1cc034035fe9b61cfceededa7c8bf04d AS cmms-api
ARG SOURCE_REVISION
ARG SOURCE_STATE_SHA256
LABEL org.opencontainers.image.title="GigaLibs Asset & Maintenance (CMMS) API" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.gigalibs.source-state-sha256="${SOURCE_STATE_SHA256}" \
      com.gigalibs.component="cmms-api" \
      com.gigalibs.work-item="WI-OI-038" \
      com.gigalibs.profile-key="module-runtime-local-development-v1"
ENV NODE_ENV=development
ENV PATH=/nodejs/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /app
COPY --from=module-build --chown=65532:65532 /output/cmms-api/ ./
USER 65532:65532
EXPOSE 4200
CMD ["dist/main.js"]
