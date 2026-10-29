#!/usr/bin/env bash
# Container entrypoint: restore autostart servers/tunnels, then serve the panel.
cd "$(dirname "$0")"
export DATA_DIR="${DATA_DIR:-/data}"
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-8}"
PORT="${PANEL_PORT:-8090}"

php cli/boot.php

echo "MC Panel escuchando en http://0.0.0.0:$PORT"
exec php \
    -d upload_max_filesize=8G -d post_max_size=8G -d memory_limit=512M \
    -d max_execution_time=0 -d max_file_uploads=2000 -d variables_order=EGPCS \
    -S "0.0.0.0:$PORT" -t . router.php
