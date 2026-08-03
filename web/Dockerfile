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
