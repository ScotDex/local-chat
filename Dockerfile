FROM node:26-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first: this layer is reused until package files change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY overlay ./overlay

# Never run as root inside the container
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "src/healthcheck.ts"]

# Run node directly, not npm, so SIGTERM reaches our shutdown handler
CMD ["node", "src/index.ts"]