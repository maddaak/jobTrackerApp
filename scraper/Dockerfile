FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o scraper-bin .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/scraper-bin .
EXPOSE 8081
CMD ["./scraper-bin"]
