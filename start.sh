#!/usr/bin/env bash
# Container entrypoint: restore autostart servers/tunnels, then serve the panel.
cd "$(dirname "$0")"
export DATA_DIR="${DATA_DIR:-/data}"
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-8}"
PORT="${PANEL_PORT:-8090}"

# Refuse to run on PHP < 8.3; warn when the branch lacks the php2shell fixes (CVE-2026-109618/109619).
if ! php -r 'exit(version_compare(PHP_VERSION, "8.3.0", ">=") ? 0 : 1);'; then
    echo "ERROR: MC Panel requiere PHP 8.3 o superior (instalado: $(php -r 'echo PHP_VERSION;')). Usa la imagen php:8.5-cli." >&2
    exit 1
fi
php -r 'require "lib/bootstrap.php"; if ($w = php_security_warning()) fwrite(STDERR, "AVISO: $w\n");'

php cli/boot.php

echo "MC Panel escuchando en http://0.0.0.0:$PORT (PHP $(php -r 'echo PHP_VERSION;'))"
# session.upload_progress is unused by the panel and is the attack surface of CVE-2026-109618/109619.
exec php \
    -d upload_max_filesize=8G -d post_max_size=8G -d memory_limit=512M \
    -d max_execution_time=0 -d max_file_uploads=2000 -d variables_order=EGPCS \
    -d session.upload_progress.enabled=0 -d expose_php=0 \
    -S "0.0.0.0:$PORT" -t . router.php
