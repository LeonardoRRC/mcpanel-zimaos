#!/usr/bin/env bash
# Runs a Minecraft server with its stdin bound to a FIFO so the panel can send commands.
# Usage: run-server.sh <run-dir> <server-dir> <startup command>
RUN="$1"
DIR="$2"
CMD="$3"
LOG="$RUN/console.log"

echo $$ > "$RUN/wrapper.pid"
[ -p "$RUN/stdin" ] || { rm -f "$RUN/stdin"; mkfifo "$RUN/stdin"; }
# Hold the FIFO open read+write so writers never block and the server never sees EOF.
exec 3<>"$RUN/stdin"
cd "$DIR" || { echo "[Panel] No existe la carpeta del servidor" >>"$LOG"; exit 1; }

while true; do
    rm -f "$RUN/stopping"
    eval "exec $CMD" <&3 >>"$LOG" 2>&1 &
    PID=$!
    echo "$PID" > "$RUN/server.pid"
    wait "$PID"
    CODE=$?
    rm -f "$RUN/server.pid" "$RUN/cpu.json"
    if [ "$CODE" -eq 0 ]; then
        printf '\033[33m[Panel]\033[0m Servidor detenido.\n' >>"$LOG"
    else
        printf '\033[31m[Panel]\033[0m El servidor terminó con código %s.\n' "$CODE" >>"$LOG"
    fi
    # Auto-restart only after a crash, never after a requested stop/kill.
    if [ "$CODE" -ne 0 ] && [ ! -f "$RUN/stopping" ] && [ "$(cat "$RUN/autorestart" 2>/dev/null)" = "1" ]; then
        printf '\033[33m[Panel]\033[0m Reinicio automático en 5 segundos...\n' >>"$LOG"
        sleep 5
        echo starting > "$RUN/state"
        continue
    fi
    break
done

echo offline > "$RUN/state"
rm -f "$RUN/wrapper.pid" "$RUN/stopping"
