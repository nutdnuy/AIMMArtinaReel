#!/usr/bin/env bash
# Opens a reel's OpenFilm export in OpenFilm Studio, the editor P.AIM changes the reel in by hand.
# Usage: open_studio.sh <project>            opens <project>/openfilm
#        open_studio.sh <folder>             opens a folder that holds film.html (openfilm-2, ...)
# Runs `npx -y openfilm@latest open <folder>` and prints what it prints. Studio then keeps running in the
# background (this script does not wait for it); the last lines say how to stop it.
set -u

[ $# -eq 1 ] || { echo "usage: open_studio.sh <project>" >&2; exit 2; }
target="$1"
if [ -f "$target/film.html" ]; then
  folder="$target"
elif [ -f "$target/openfilm/film.html" ]; then
  folder="$target/openfilm"
else
  echo "open_studio.sh: no OpenFilm export in $target: run scripts/export_openfilm.mjs <project> first" >&2
  exit 2
fi
folder="$(cd "$folder" && pwd)"

log="$(mktemp "${TMPDIR:-/tmp}/paim-studio.XXXXXX")" || exit 1
trap 'rm -f "$log"' EXIT

# The command ends once Studio is up; a stalled download or start is cut off after three minutes.
npx -y openfilm@latest open "$folder" >"$log" 2>&1 &
pid=$!
waited=0
while kill -0 "$pid" 2>/dev/null; do
  if [ "$waited" -ge 180 ]; then
    kill "$pid" 2>/dev/null
    cat "$log"
    echo "open_studio.sh: openfilm did not answer within 3 minutes" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done
wait "$pid"
status=$?
cat "$log"
[ "$status" -eq 0 ] || exit "$status"

url="$(sed -n 's/^Studio  *\(http[^ ]*\).*/\1/p' "$log" | head -1)"
port="${url##*:}"
port="${port%%/*}"
echo
echo "Studio keeps running in the background, on this computer only. Leave it running while P.AIM edits."
if [ -n "$port" ] && [ "$port" -eq "$port" ] 2>/dev/null; then
  echo "To stop it (every film open in it closes): lsof -ti tcp:$port -sTCP:LISTEN | xargs kill"
else
  echo "To stop it: quit it from Studio, or end the node process that listens on the Studio address above."
fi
