FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# No debug symbols or build paths: a third smaller, and a crash's stack trace still names each function.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o scraper-bin ./cmd/scraper

FROM alpine:3.24
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /app/scraper-bin .
USER app
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1
CMD ["./scraper-bin"]
