#!/usr/bin/env bash
# Point this repo's git hooks at the versioned .githooks/ directory.
#
#   scripts/install-hooks.sh          # install
#   scripts/install-hooks.sh --remove # back to .git/hooks
#
# core.hooksPath is per-clone config, so it is not inherited by a fresh clone —
# run this once after cloning. The hooks themselves are versioned, which is the
# half that used to live in .github/workflows and now does not.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if [ "${1:-}" = "--remove" ]; then
  git config --unset core.hooksPath && echo "hooks: back to .git/hooks" || echo "hooks: nothing to remove"
  exit 0
fi
chmod +x .githooks/* 2>/dev/null || true
git config core.hooksPath .githooks
echo "hooks: core.hooksPath -> .githooks ($(ls .githooks | tr '\n' ' '))"
