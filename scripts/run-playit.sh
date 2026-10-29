#!/usr/bin/env bash
# Runs the playit daemon for one server. The panel reads tunnel state over its IPC socket.
# Usage: run-playit.sh <dir> <playitd> <playit-cli> <secret-file>
DIR="$1"
DAEMON="$2"
SECRET_FILE="$4"
SOCK="$DIR/playit.sock"

echo $$ > "$DIR/wrapper.pid"
rm -f "$SOCK" "$DIR/attach.pid"
: > "$DIR/agent.log"
: > "$DIR/playitd.log"

"$DAEMON" --secret "$(cat "$SECRET_FILE")" --socket-path "$SOCK" --platform-docker \
    --log-path "$DIR/playitd.log" >>"$DIR/agent.log" 2>&1 &
DPID=$!
echo "$DPID" > "$DIR/playitd.pid"

wait "$DPID"
rm -f "$DIR/playitd.pid" "$DIR/wrapper.pid" "$SOCK"
