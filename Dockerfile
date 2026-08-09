# Puppeteer's official image ships Chromium + all system libs — the reliable way to deploy.
FROM ghcr.io/puppeteer/puppeteer:22.12.1

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production

# Run as root: lets npm install write to /app during build, and lets the app
# write the submission log to Render's disk mounted at /var/data at runtime.
# Chrome launches with --no-sandbox in mailer.js, so running as root is safe here.
USER root
WORKDIR /app

# ffmpeg brands the seller interview videos (title card + segue). We copy a
# prebuilt STATIC ffmpeg/ffprobe straight from a known image instead of using
# apt — the Puppeteer base image is an older Debian whose package repos can be
# archived/unreachable, which made `apt-get install ffmpeg` fail the build.
# The static binary has no system deps, so the base image's repo state can't
# break us. The DejaVu fonts the title card draws with are bundled in ./fonts.
COPY --from=mwader/static-ffmpeg:7.1 /ffmpeg /usr/local/bin/ffmpeg
COPY --from=mwader/static-ffmpeg:7.1 /ffprobe /usr/local/bin/ffprobe

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY . .

EXPOSE 8787
CMD ["node", "server.js"]
