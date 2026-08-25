#!/usr/bin/env bash
# Portable wrapper around `graphify hook-guard`, committed to the repo so the
# project-scoped PreToolUse hook in .claude/settings.json never bakes in a
# machine-specific absolute path (fresh/ephemeral Claude Code containers will
# not have graphifyy pre-installed at any fixed location).
#
# Version policy: installs/reinstalls to the EXACT version pinned in
# .claude/skills/graphify/.graphify_version (the version this repo's graph
# was built and committed with), not "latest" - so a fresh container never
# silently drifts onto a newer/older graphify than what produced graph.json.
# The pin is only trusted if it matches a strict X.Y.Z pattern (defense
# against a malformed or tampered version file); otherwise this falls back
# to unpinned "latest" behavior.
#
# Resolution order (on first call, or whenever the pin changes):
#   1. `graphify` already on PATH / common uv-tool install locations.
#   2. Compare its `--version` against the pin. Matches -> reused as-is.
#      Differs, or nothing found -> `uv tool install [--force] "graphifyy[sql]==<pin>"`.
#   3. Re-resolve after install.
# A local marker file (graphify-out/.graphify_guard_bootstrap, gitignored)
# caches "already verified against this pin" so steady-state calls after the
# first one in a session are a cheap file-read, not a subprocess + reinstall
# check on every single tool call.
#
# If graphify still cannot be found or installed (no uv, no network), this
# fails OPEN (exit 0, tool call proceeds) rather than blocking every tool
# call in an environment with no way to satisfy the dependency. Strict mode
# is therefore enforced whenever graphify is present or installable, and
# NOT enforced in that one unavoidable fallback case - which is always
# surfaced via hookSpecificOutput.additionalContext, never silent.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION_FILE="$SCRIPT_DIR/../skills/graphify/.graphify_version"
MARKER_FILE="$SCRIPT_DIR/../../graphify-out/.graphify_guard_bootstrap"

find_graphify() {
    if command -v graphify >/dev/null 2>&1; then
        command -v graphify
        return 0
    fi
    for cand in \
        "$HOME/.local/bin/graphify" \
        "${UV_TOOL_DIR:-$HOME/.local/share/uv/tools}/graphifyy/bin/graphify" \
    ; do
        if [ -x "$cand" ]; then
            printf '%s\n' "$cand"
            return 0
        fi
    done
    return 1
}

# --- Resolve the pinned version, strictly validated (no shell injection /
# malformed-version risk: only ever used as an already-quoted argument, and
# rejected outright unless it is exactly digits-dot-digits-dot-digits). ---
PINNED_VERSION=""
if [ -f "$VERSION_FILE" ]; then
    _raw="$(cat "$VERSION_FILE" 2>/dev/null | tr -d '[:space:]')"
    if [[ "$_raw" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        PINNED_VERSION="$_raw"
    fi
fi
PIN_TOKEN="${PINNED_VERSION:-unpinned}"

# --- Fast path: already verified against this exact pin in this container. ---
if [ -f "$MARKER_FILE" ] && [ "$(cat "$MARKER_FILE" 2>/dev/null)" = "$PIN_TOKEN" ]; then
    GRAPHIFY_BIN="$(find_graphify)"
    if [ -n "$GRAPHIFY_BIN" ]; then
        exec "$GRAPHIFY_BIN" hook-guard "$@"
    fi
    # Binary vanished since last verification (e.g. tool env wiped) - fall
    # through to the full re-resolution/install path below.
fi

# --- Slow path: resolve, compare, install/reconcile if needed, cache. ---
GRAPHIFY_BIN="$(find_graphify)"
CURRENT_VERSION=""
if [ -n "$GRAPHIFY_BIN" ]; then
    CURRENT_VERSION="$("$GRAPHIFY_BIN" --version 2>/dev/null | awk '{print $2}')"
fi

if command -v uv >/dev/null 2>&1; then
    if [ -n "$PINNED_VERSION" ]; then
        if [ -z "$GRAPHIFY_BIN" ]; then
            # Missing entirely -> install the pinned version.
            uv tool install "graphifyy[sql]==$PINNED_VERSION" -q >/dev/null 2>&1
        elif [ "$CURRENT_VERSION" != "$PINNED_VERSION" ]; then
            # A different version is installed -> converge predictably to the pin.
            uv tool install --force "graphifyy[sql]==$PINNED_VERSION" -q >/dev/null 2>&1
        else
            # Version already matches - idempotent no-op call (uv resolves and
            # does nothing) just to guarantee the [sql] extra is present too.
            uv tool install "graphifyy[sql]==$PINNED_VERSION" -q >/dev/null 2>&1
        fi
    elif [ -z "$GRAPHIFY_BIN" ]; then
        # No usable pin on file - fall back to unpinned latest (old behavior).
        uv tool install "graphifyy[sql]" -q >/dev/null 2>&1
    fi
    GRAPHIFY_BIN="$(find_graphify)"
fi

if [ -z "$GRAPHIFY_BIN" ]; then
    _pin_hint="${PINNED_VERSION:+==$PINNED_VERSION}"
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"graphify is not installed in this environment and could not be self-installed (uv unavailable or offline). Strict graph-first navigation is NOT enforced this session - this is a fail-open fallback, not universal enforcement. If uv is available, run: uv tool install \\"graphifyy[sql]%s\\" - then retry."}}\n' "$_pin_hint"
    exit 0
fi

mkdir -p "$(dirname "$MARKER_FILE")" 2>/dev/null
printf '%s' "$PIN_TOKEN" > "$MARKER_FILE" 2>/dev/null

exec "$GRAPHIFY_BIN" hook-guard "$@"
