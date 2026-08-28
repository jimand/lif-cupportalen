FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine

# sqlite-CLI:t behövs av backup.sh (".backup" ger en konsistent kopia under
# drift) och av felsökningskommandona i README. better-sqlite3 är en
# Node-bindning och ger inget CLI.
RUN apk add --no-cache sqlite

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /data && \
    addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app /data

USER appuser

EXPOSE 3001
ENV NODE_ENV=production
ENV DB_PATH=/data/cups.db

CMD ["node", "dist/index.js"]
