#!/usr/bin/env bash
# Opens a reel's OpenFilm export in OpenFilm Studio, the editor P.AIM changes the reel in by hand.
# Usage: open_studio.sh <project>            opens <project>/openfilm
#        open_studio.sh <folder>             opens a folder that holds film.html (openfilm-2, ...)
# Runs `npx -y openfilm@latest open <folder>` and prints what it prints. Studio then keeps running in the
# background (this script does not wait for it). Studio is hers: it may be a Studio she already had open with
# other films in it, so this script never stops it and does not say how. PAIM_STUDIO_TIMEOUT (seconds, default
# 180) is how long the command may take; a command that stalls is stopped with everything it started.
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
limit="${PAIM_STUDIO_TIMEOUT:-180}"

log="$(mktemp "${TMPDIR:-/tmp}/paim-studio.XXXXXX")" || exit 1
pid=""
# Only a command that is still running (it stalled, or this script was interrupted) is stopped, and as a whole
# process group: the npx wrapper and the node process it started. A Studio that did start is a process of its
# own, outside that group, and is left running.
cleanup() {
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then kill -- "-$pid" 2>/dev/null; fi
  rm -f "$log"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

set -m # the background command gets a process group of its own (its pid is the group's id)
npx -y openfilm@latest open "$folder" </dev/null >"$log" 2>&1 &
pid=$!
set +m
waited=0
while kill -0 "$pid" 2>/dev/null; do
  if [ "$waited" -ge "$limit" ]; then
    cat "$log"
    echo "open_studio.sh: openfilm did not answer within $limit seconds" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done
wait "$pid" 2>/dev/null
status=$?
pid=""
cat "$log"
[ "$status" -eq 0 ] || exit "$status"

echo
echo "Studio keeps running in the background, on this computer only."
echo "Studio is hers; never stop or restart it. She closes it herself."
echo "The Studio address above contains a local session key: give it to her once, in the chat only. Never write it into a file, a note, a log, a commit message or the delivery note."
