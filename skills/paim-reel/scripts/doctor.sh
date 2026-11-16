#!/usr/bin/env bash
# Reports whether paim-reel has everything it needs.
# Usage: doctor.sh [--agent claude|codex]   (default claude, the stricter one)
# Exit 0 only when nothing is MISSING and onboarding is done.
set -u

SKILL="$(cd "$(dirname "$0")/.." && pwd)"
agent=claude

while [ $# -gt 0 ]; do
  case "$1" in
    --agent)
      [ $# -ge 2 ] || { echo "doctor.sh: --agent needs claude or codex" >&2; exit 2; }
      agent="$2"; shift 2 ;;
    *) echo "usage: doctor.sh [--agent claude|codex]" >&2; exit 2 ;;
  esac
done
case "$agent" in
  claude|codex) ;;
  *) echo "doctor.sh: --agent must be claude or codex, got: $agent" >&2; exit 2 ;;
esac

missing=0
ok()   { echo "ok $*"; }
miss() { echo "MISSING $*"; missing=1; }

# ---- node -------------------------------------------------------------------
have_node=0
if command -v node >/dev/null 2>&1; then
  have_node=1
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$node_major" -ge 20 ] 2>/dev/null; then
    ok "node $(node -v)"
  else
    miss "node (found major $node_major, need 20 or newer)"
  fi
else
  miss "node (not found)"
fi

# ---- ffmpeg / ffprobe -------------------------------------------------------
for tool in ffmpeg ffprobe; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool"; else miss "$tool (not found)"; fi
done

# ---- playwright + Chromium --------------------------------------------------
if [ -d "$SKILL/node_modules/playwright" ]; then
  ok "playwright"
  chromium=""
  if [ "$have_node" -eq 1 ]; then
    chromium="$(cd "$SKILL" && node --input-type=module \
      -e "import { chromium } from 'playwright'; console.log(chromium.executablePath());" 2>/dev/null)"
  fi
  if [ -n "$chromium" ] && [ -e "$chromium" ]; then
    ok "chromium"
  else
    miss "chromium (run: npx playwright install chromium)"
  fi
else
  miss "playwright (run install.sh)"
  miss "chromium (needs playwright)"
fi

# ---- python packages --------------------------------------------------------
py="$SKILL/.venv/bin/python"
if [ -x "$py" ] && "$py" -c 'import faster_whisper, PIL' >/dev/null 2>&1; then
  ok "python packages (faster_whisper, PIL)"
else
  miss "python packages (run install.sh)"
fi

# ---- font -------------------------------------------------------------------
if [ -f /System/Library/Fonts/Supplemental/SukhumvitSet.ttc ]; then
  echo "font: Sukhumvit Set"
else
  echo "font: IBM Plex Sans Thai (fallback)"
fi

# ---- openfilm (optional: OpenFilm Studio, where P.AIM changes the reel by hand) ---
# Studio needs Node 22.2 or newer; an older Node only means no hand-edit hand-off, so this is a WARN.
node_version=""
[ "$have_node" -eq 1 ] && node_version="$(node -p 'process.versions.node' 2>/dev/null)"
IFS=. read -r nv_major nv_minor _ <<<"$node_version"
if [ "${nv_major:-0}" -gt 22 ] 2>/dev/null || { [ "${nv_major:-0}" -eq 22 ] && [ "${nv_minor:-0}" -ge 2 ]; } 2>/dev/null; then
  echo "openfilm: ok"
else
  echo "WARN openfilm (needs Node 22.2 or newer)"
fi

# ---- profile ----------------------------------------------------------------
profile_get() {
  [ "$have_node" -eq 1 ] || return 0
  node "$SKILL/scripts/profile.mjs" get "$1" 2>/dev/null || true
}

# ---- image CLI --------------------------------------------------------------
if [ "$agent" = codex ]; then
  provider=codex
else
  provider="$(profile_get image_cli)"
fi

if [ -z "$provider" ]; then
  echo "MISSING image-cli (not chosen)"; missing=1
else
  cmd="${PAIM_IMAGE_CMD:-$(profile_get image_cmd)}"
  [ -n "$cmd" ] || cmd="$provider"
  exe="${cmd%% *}"
  if command -v "$exe" >/dev/null 2>&1; then
    echo "image-cli: ok $provider"
  else
    echo "MISSING image-cli ($exe not found)"; missing=1
  fi
fi

# ---- onboarding -------------------------------------------------------------
if [ -n "$(profile_get onboarded_at)" ]; then
  echo "onboarding: done"
  onboarded=1
else
  echo "onboarding: needed"
  onboarded=0
fi

[ "$missing" -eq 0 ] && [ "$onboarded" -eq 1 ]
