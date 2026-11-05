# The same Alpine release as the final stage, since its node binary is copied there and needs that musl.
FROM node:24-alpine3.24 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Only what runs, installed here so the final image needs no package manager.
RUN npm ci --omit=dev

# Plain Alpine plus the node binary, rather than the node image, whose npm, yarn and corepack stay in its
# layers even if deleted. libstdc++ is the one library node needs that Alpine lacks.
FROM alpine:3.24
RUN apk add --no-cache libstdc++ && adduser -D -u 1000 node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
# Baked in by the publish workflow so the running image knows which release it is; "dev" locally.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
