# MC Panel image: the React UI is built here, then shipped on the official PHP CLI image.
# Published to ghcr.io/leonardorrc/mcpanel by .github/workflows/docker.yml.

FROM node:26.13.0-slim AS web
WORKDIR /w
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build -- --outDir /out --emptyOutDir

# php:8.5-cli brings bash, tar and the curl + posix extensions the panel uses.
FROM php:8.5-cli
LABEL org.opencontainers.image.title="MC Panel" \
      org.opencontainers.image.description="Minecraft server panel with console, file manager, Modrinth, backups and playit.gg tunnels." \
      org.opencontainers.image.source="https://github.com/LeonardoRRC/mcpanel-zimaos" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY api.php router.php start.sh LICENSE ./
COPY lib/ lib/
COPY cli/ cli/
COPY scripts/ scripts/
COPY assets/ assets/
COPY --from=web /out/ dist/
ENV DATA_DIR=/data \
    PANEL_PORT=8090 \
    PHP_CLI_SERVER_WORKERS=8
VOLUME /data
EXPOSE 8090
CMD ["bash", "/app/start.sh"]
