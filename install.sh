#!/usr/bin/env bash
# Installs paim-reel: dependencies, then a symlink into each agent's skills folder.
# Usage: install.sh [--home <dir>] [--claude] [--codex] [--check]
#   no agent flag = both; --check only runs the doctor; PAIM_SKIP_DEPS=1 skips dependencies.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd -P)"
SKILL="$ROOT/skills/paim-reel"
home="$HOME"
want_claude=0
want_codex=0
check=0

while [ $# -gt 0 ]; do
  case "$1" in
    --home)
      [ $# -ge 2 ] || { echo "install.sh: --home needs a folder" >&2; exit 2; }
      home="$2"; shift 2 ;;
    --claude) want_claude=1; shift ;;
    --codex)  want_codex=1; shift ;;
    --check)  check=1; shift ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) echo "install.sh: unknown option: $1" >&2; exit 2 ;;
  esac
done
if [ "$want_claude" -eq 0 ] && [ "$want_codex" -eq 0 ]; then want_claude=1; want_codex=1; fi

if [ "$check" -eq 1 ]; then
  agent=claude
  [ "$want_claude" -eq 0 ] && agent=codex
  exec "$SKILL/scripts/doctor.sh" --agent "$agent"
fi

targets=()
[ "$want_claude" -eq 1 ] && targets+=("$home/.claude/skills/paim-reel")
[ "$want_codex" -eq 1 ] && targets+=("$home/.codex/skills/paim-reel")

is_our_link() {
  [ -L "$1" ] && [ "$(cd "$1" 2>/dev/null && pwd -P)" = "$SKILL" ]
}

# Fail before the slow part if any target is already taken by something else.
for target in "${targets[@]}"; do
  if [ -e "$target" ] || [ -L "$target" ]; then
    if ! is_our_link "$target"; then
      echo "install.sh: $target already exists and is not a link to this skill; leaving it alone" >&2
      exit 1
    fi
  fi
done

python_in_range() {
  "$1" -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)' 2>/dev/null
}

install_deps() {
  command -v node >/dev/null 2>&1 || { echo "install.sh: node 20 or newer is required" >&2; exit 1; }
  command -v npm >/dev/null 2>&1 || { echo "install.sh: npm is required" >&2; exit 1; }
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || { echo "install.sh: node 20 or newer is required (found $major)" >&2; exit 1; }

  cd "$SKILL"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  npx playwright install chromium

  local venv="$SKILL/.venv"
  if [ -x "$venv/bin/python" ]; then
    python_in_range "$venv/bin/python" || {
      echo "install.sh: $venv uses a Python outside 3.10-3.12; delete it and run again" >&2
      exit 1
    }
  elif command -v uv >/dev/null 2>&1; then
    uv venv --python 3.12 "$venv"
  else
    command -v python3 >/dev/null 2>&1 && python_in_range "$(command -v python3)" || {
      echo "install.sh: Python 3.10-3.12 is required (faster-whisper has no wheels beyond 3.12); install uv or Python 3.12" >&2
      exit 1
    }
    python3 -m venv "$venv"
  fi

  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$venv/bin/python" -r "$SKILL/requirements.txt"
  else
    "$venv/bin/python" -m pip install -r "$SKILL/requirements.txt"
  fi
}

if [ -z "${PAIM_SKIP_DEPS:-}" ]; then install_deps; fi

for target in "${targets[@]}"; do
  if is_our_link "$target"; then
    echo "already linked: $target"
  else
    mkdir -p "$(dirname "$target")"
    ln -s "$SKILL" "$target"
    echo "linked: $target -> $SKILL"
  fi
done
