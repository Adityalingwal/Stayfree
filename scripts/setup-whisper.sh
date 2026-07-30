#!/usr/bin/env bash
#
# setup-whisper.sh — bootstrap the local whisper.cpp sidecar assets.
#
# Copies the whisper-server binary, its dylibs, and the q8_0 Hinglish model
# from a local whisper.cpp build (~/stt-testing by default — override with
# WHISPER_CPP_SRC / WHISPER_MODEL_SRC) into StayFree's userData directory,
# patches the binary's rpath so it's self-contained (does not depend on the
# source build tree existing), and runs a one-shot smoke test.
#
# Staged atomic install (post-review hardening, 2026-07-30 — see
# docs/reviews/FIX-PLAN-2026-07-30.md FIX 9): everything is prepared and
# verified in a temporary sibling staging dir on the same volume; the live
# install is only swapped in (atomic `mv`) after EVERY step — copy
# completeness, rpath patch, codesign, smoke test — has passed. A failure at
# any point deletes the staging dir and leaves an existing working install
# untouched.
#
# macOS only — this app is macOS-only (Metal/whisper.cpp), and this script
# uses macOS-specific tools (install_name_tool, codesign, otool).
#
# Usage: scripts/setup-whisper.sh
#
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "setup-whisper.sh is macOS-only (StayFree itself is macOS-only)." >&2
  exit 1
fi

WHISPER_CPP_SRC="${WHISPER_CPP_SRC:-$HOME/stt-testing/whisper.cpp/build/bin}"
WHISPER_MODEL_SRC="${WHISPER_MODEL_SRC:-$HOME/stt-testing/ggml-models/ggml-swift-q8_0.bin}"

SUPPORT_DIR="$HOME/Library/Application Support/StayFree"
DEST_ROOT="$SUPPORT_DIR/whisper"
# Same-volume siblings of the live install — required for atomic `mv`.
STAGING_ROOT="$SUPPORT_DIR/whisper.staging.$$"
OLD_ASIDE="$SUPPORT_DIR/whisper.previous.$$"
STAGING_BIN="$STAGING_ROOT/bin"
STAGING_MODEL_DIR="$STAGING_ROOT/model"
STAGING_MODEL="$STAGING_MODEL_DIR/ggml-swift-q8_0.bin"
STAGED_SERVER="$STAGING_BIN/whisper-server"
SMOKE_LOG="/tmp/stayfree-whisper-setup-smoke.log"
SMOKE_PID=""

cleanup() {
  # Kill a still-running smoke server, drop the staging dir, and — if the
  # swap was interrupted after the old install was moved aside but before
  # the staged one landed — restore the previous install.
  if [[ -n "$SMOKE_PID" ]]; then
    kill -9 "$SMOKE_PID" 2>/dev/null || true
  fi
  rm -rf "$STAGING_ROOT" 2>/dev/null || true
  if [[ -d "$OLD_ASIDE" && ! -d "$DEST_ROOT" ]]; then
    mv "$OLD_ASIDE" "$DEST_ROOT" 2>/dev/null || true
  fi
  if [[ -d "$OLD_ASIDE" && -d "$DEST_ROOT" ]]; then
    rm -rf "$OLD_ASIDE" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "== StayFree whisper.cpp setup =="
echo "Source binaries: $WHISPER_CPP_SRC"
echo "Source model:    $WHISPER_MODEL_SRC"
echo "Destination:     $DEST_ROOT"
echo "Staging dir:     $STAGING_ROOT"
echo

if [[ ! -d "$WHISPER_CPP_SRC" ]]; then
  echo "ERROR: whisper.cpp build dir not found at $WHISPER_CPP_SRC" >&2
  echo "Build whisper.cpp with Metal support first, or set WHISPER_CPP_SRC." >&2
  exit 1
fi
if [[ ! -f "$WHISPER_CPP_SRC/whisper-server" ]]; then
  echo "ERROR: whisper-server binary not found at $WHISPER_CPP_SRC/whisper-server" >&2
  exit 1
fi
if [[ ! -f "$WHISPER_MODEL_SRC" ]]; then
  echo "ERROR: model not found at $WHISPER_MODEL_SRC" >&2
  echo "Set WHISPER_MODEL_SRC to the ggml-swift-q8_0.bin path." >&2
  exit 1
fi

# Resolve the dylib sets up front — an unmatched glob must be a clean error,
# not a confusing literal-pattern `cp` failure.
shopt -s nullglob
ggml_dylibs=("$WHISPER_CPP_SRC"/libggml*.dylib)
whisper_dylibs=("$WHISPER_CPP_SRC"/libwhisper*.dylib)
shopt -u nullglob
if (( ${#ggml_dylibs[@]} == 0 )); then
  echo "ERROR: no libggml*.dylib found in $WHISPER_CPP_SRC — incomplete whisper.cpp build?" >&2
  exit 1
fi
if (( ${#whisper_dylibs[@]} == 0 )); then
  echo "ERROR: no libwhisper*.dylib found in $WHISPER_CPP_SRC — incomplete whisper.cpp build?" >&2
  exit 1
fi

echo "-- Staging copy: binary + dylibs --"
mkdir -p "$STAGING_BIN" "$STAGING_MODEL_DIR"
cp "$WHISPER_CPP_SRC/whisper-server" "$STAGING_BIN/"
cp "${ggml_dylibs[@]}" "${whisper_dylibs[@]}" "$STAGING_BIN/"

echo "-- Staging copy: model (this may take a moment — ~82MB) --"
cp "$WHISPER_MODEL_SRC" "$STAGING_MODEL"

echo "-- Completeness check (every required file, size-compared) --"
check_copy() {
  local src="$1" dst="$2" src_size dst_size
  if [[ ! -f "$dst" ]]; then
    echo "ERROR: staged copy missing: $dst" >&2
    exit 1
  fi
  src_size=$(stat -f%z "$src")
  dst_size=$(stat -f%z "$dst")
  if [[ "$src_size" != "$dst_size" ]]; then
    echo "ERROR: size mismatch for $(basename "$dst") (src=$src_size dst=$dst_size) — copy incomplete/corrupt." >&2
    exit 1
  fi
}
check_copy "$WHISPER_CPP_SRC/whisper-server" "$STAGED_SERVER"
for lib in "${ggml_dylibs[@]}" "${whisper_dylibs[@]}"; do
  check_copy "$lib" "$STAGING_BIN/$(basename "$lib")"
done
check_copy "$WHISPER_MODEL_SRC" "$STAGING_MODEL"
chmod +x "$STAGED_SERVER"
echo "OK: whisper-server, ${#ggml_dylibs[@]}+${#whisper_dylibs[@]} dylibs, model — all staged and size-verified."

echo "-- Patching rpath (self-containment — see docs/whisper-preflight-phase0.md) --"
# Read the binary's ACTUAL LC_RPATH entries and delete every absolute one —
# never assume what the build machine's rpath was (a binary built anywhere
# other than the default location would otherwise abort the script with a
# cryptic install_name_tool error).
while IFS= read -r rp; do
  [[ -z "$rp" ]] && continue
  if [[ "$rp" == /* ]]; then
    echo "   deleting absolute rpath: $rp"
    install_name_tool -delete_rpath "$rp" "$STAGED_SERVER"
  fi
done < <(otool -l "$STAGED_SERVER" | awk '/cmd LC_RPATH/{f=1;next} f && /path /{line=$0; sub(/^ *path /,"",line); sub(/ \(offset [0-9]+\)$/,"",line); print line; f=0}')
if ! otool -l "$STAGED_SERVER" | grep -q "path @loader_path "; then
  install_name_tool -add_rpath "@loader_path" "$STAGED_SERVER"
fi
# install_name_tool invalidates the code signature on arm64 — a copy with a
# broken signature refuses to launch. Ad-hoc re-sign restores it.
codesign -s - -f "$STAGED_SERVER"

echo "-- Verifying rpath --"
rpath_lines=$(otool -l "$STAGED_SERVER" | grep -A2 LC_RPATH | grep "path " || true)
echo "$rpath_lines"
if [[ "$rpath_lines" != *"@loader_path"* ]]; then
  echo "ERROR: rpath patch did not take effect (@loader_path missing)." >&2
  exit 1
fi
if echo "$rpath_lines" | grep -Eq "path /"; then
  echo "ERROR: an absolute rpath survived the patch — binary is not self-contained." >&2
  exit 1
fi

echo "-- Smoke test (staged binary: spawn, GET / readiness probe, kill) --"
# NOTE: on a genuinely fresh binary path, macOS's Metal shader compiler does
# a one-time cold compile that took ~7.5s in testing (subsequent runs at the
# SAME path are ~0.01-0.15s — the OS caches per-path, not just by shader
# content). This smoke test's spawn pays that cost NOW, during setup. (The
# smoke runs at the STAGING path; the atomic mv below preserves the inode,
# but if the cache still treats the final path as fresh, the app tolerates
# it — server.ts's lateReady adoption keeps a slow first spawn alive up to
# 15s and adopts it once ready.)
#
# Dynamic free port — a fixed port could already be occupied, in which case
# the staged server would bind-fail and die while curl happily talks to
# whatever occupies the port: a false "Setup complete".
find_free_port() {
  local candidate try
  for try in $(seq 1 20); do
    candidate=$(( (RANDOM % 16384) + 49152 ))
    if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}
PORT="$(find_free_port)" || {
  echo "ERROR: could not find a free port for the smoke test." >&2
  exit 1
}
echo "   using port $PORT"

"$STAGED_SERVER" -m "$STAGING_MODEL" --host 127.0.0.1 --port "$PORT" \
  -l hi -nt -bs 1 -bo 1 -t 4 >"$SMOKE_LOG" 2>&1 &
SMOKE_PID=$!

ready=0
# Generous window: a genuinely cold Metal shader compile on a fresh path
# measured ~7.5s in testing — 400 * 0.05s = 20s comfortably covers it.
for _ in $(seq 1 400); do
  # Success requires BOTH: our spawned server is still alive AND it answers
  # HTTP on the port. An HTTP answer alone could come from a foreign
  # process if our server bind-failed and died.
  if ! kill -0 "$SMOKE_PID" 2>/dev/null; then
    echo "ERROR: staged whisper-server exited during the smoke test. Log:" >&2
    cat "$SMOKE_LOG" >&2
    exit 1
  fi
  if curl -sS -m 0.3 -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.05
done

if [[ "$ready" != "1" ]]; then
  echo "ERROR: staged whisper-server did not become ready. Log:" >&2
  cat "$SMOKE_LOG" >&2
  exit 1
fi
if ! kill -0 "$SMOKE_PID" 2>/dev/null; then
  echo "ERROR: staged whisper-server died right after responding — refusing to install. Log:" >&2
  cat "$SMOKE_LOG" >&2
  exit 1
fi

kill -9 "$SMOKE_PID" 2>/dev/null || true
wait "$SMOKE_PID" 2>/dev/null || true
SMOKE_PID=""
echo "OK: staged server stayed alive and answered the GET / readiness probe."

echo "-- Atomic install swap --"
if [[ -d "$DEST_ROOT" ]]; then
  mv "$DEST_ROOT" "$OLD_ASIDE"
fi
mv "$STAGING_ROOT" "$DEST_ROOT"
rm -rf "$OLD_ASIDE" 2>/dev/null || true
echo "OK: staged install swapped in. Setup complete."
echo
echo "Assets installed at: $DEST_ROOT"
echo "You can now run StayFree — the whisper sidecar will start automatically."
