FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx envsubst renders SERVER_NAME at startup (filter excludes $host/$uri), so a real domain needs no rebuild.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV SERVER_NAME=localhost
ENV NGINX_ENVSUBST_FILTER=^SERVER_NAME$
EXPOSE 443
# No USER here: the master needs root to bind 443, and nginx already drops its workers to the
# unprivileged "nginx" user. 127.0.0.1 rather than localhost, which resolves to ::1 first while
# nginx binds IPv4 only. --no-check-certificate because the cert is for SERVER_NAME, not localhost.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- --no-check-certificate https://127.0.0.1/health || exit 1
