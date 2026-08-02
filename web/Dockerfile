FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Rendered by the nginx image's envsubst at startup; the filter substitutes only SERVER_NAME
# (not nginx's own $host/$uri), so a real domain is set at run time without a rebuild.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV SERVER_NAME=localhost
ENV NGINX_ENVSUBST_FILTER=^SERVER_NAME$
EXPOSE 443
