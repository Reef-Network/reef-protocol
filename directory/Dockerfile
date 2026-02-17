FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY protocol/package.json protocol/
COPY client/package.json client/
COPY directory/package.json directory/

# Install dependencies (full install — tsc is a root devDependency)
RUN npm ci

# Copy source
COPY tsconfig.base.json ./
COPY protocol/ protocol/
COPY directory/ directory/

# Build
RUN npm run build -w protocol && npm run build -w directory

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/protocol/package.json protocol/
COPY --from=builder /app/protocol/dist protocol/dist/
COPY --from=builder /app/directory/package.json directory/
COPY --from=builder /app/directory/dist directory/dist/
COPY --from=builder /app/client/package.json client/

# Install production dependencies only
RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "directory/dist/index.js"]
