# Stage 1: Build Go static binary
FROM golang:1.22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git ca-certificates
COPY go.mod ./
RUN go mod download || true
COPY . ./
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o karpenter-pulse .

# Stage 2: Minimal run container
FROM alpine:3.19
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata && update-ca-certificates
COPY --from=builder /app/karpenter-pulse /app/karpenter-pulse

ENV PORT=4000
EXPOSE 4000

CMD ["/app/karpenter-pulse"]
