# Puppeteer's official image ships Chromium + all system libs — the reliable way to deploy.
FROM ghcr.io/puppeteer/puppeteer:22.12.1

# The base image pre-installs Chrome under pptruser's cache. We run as root (below),
# so point Puppeteer at that cache explicitly — otherwise it looks in /root/.cache/puppeteer,
# finds nothing, and PDF sends fail with "Could not find Chrome".
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
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

# Guarantee the Chrome that Puppeteer 22.12.1 needs is present in the cache dir set above.
# The base image already ships it (so this is a fast no-op), but this makes the PDF/email
# send resilient to any cache-path drift instead of failing in front of a user at runtime.
RUN npx puppeteer browsers install chrome

# App source
COPY . .

EXPOSE 8787
CMD ["node", "server.js"]
