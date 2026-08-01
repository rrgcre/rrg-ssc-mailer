# Puppeteer's official image ships Chromium + all system libs — the reliable way to deploy.
FROM ghcr.io/puppeteer/puppeteer:22.12.1

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production

# Run as root: lets npm install write to /app during build, and lets the app
# write the submission log to Render's disk mounted at /var/data at runtime.
# Chrome launches with --no-sandbox in mailer.js, so running as root is safe here.
USER root
WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY . .

EXPOSE 8787
CMD ["node", "server.js"]
