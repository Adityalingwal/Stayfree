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

DEST_ROOT="$HOME/Library/Application Support/StayFree/whisper"
DEST_BIN="$DEST_ROOT/bin"
DEST_MODEL_DIR="$DEST_ROOT/model"
DEST_MODEL="$DEST_MODEL_DIR/ggml-swift-q8_0.bin"

echo "== StayFree whisper.cpp setup =="
echo "Source binaries: $WHISPER_CPP_SRC"
echo "Source model:    $WHISPER_MODEL_SRC"
echo "Destination:     $DEST_ROOT"
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

echo "-- Copying binary + dylibs --"
mkdir -p "$DEST_BIN" "$DEST_MODEL_DIR"
cp "$WHISPER_CPP_SRC/whisper-server" "$DEST_BIN/"
cp "$WHISPER_CPP_SRC"/libggml*.dylib "$DEST_BIN/"
cp "$WHISPER_CPP_SRC"/libwhisper*.dylib "$DEST_BIN/"
chmod +x "$DEST_BIN/whisper-server"

echo "-- Copying model (this may take a moment — ~82MB) --"
cp "$WHISPER_MODEL_SRC" "$DEST_MODEL"

echo "-- Completeness check (file sizes) --"
src_bin_size=$(stat -f%z "$WHISPER_CPP_SRC/whisper-server")
dst_bin_size=$(stat -f%z "$DEST_BIN/whisper-server")
if [[ "$src_bin_size" != "$dst_bin_size" ]]; then
  echo "ERROR: whisper-server copy size mismatch (src=$src_bin_size dst=$dst_bin_size) — copy may have failed." >&2
  exit 1
fi
src_model_size=$(stat -f%z "$WHISPER_MODEL_SRC")
dst_model_size=$(stat -f%z "$DEST_MODEL")
if [[ "$src_model_size" != "$dst_model_size" ]]; then
  echo "ERROR: model copy size mismatch (src=$src_model_size dst=$dst_model_size) — copy may be incomplete/corrupt." >&2
  exit 1
fi
echo "OK: whisper-server ${dst_bin_size} bytes, model ${dst_model_size} bytes."

echo "-- Patching rpath (self-containment — see docs/whisper-preflight-phase0.md) --"
install_name_tool -rpath "$WHISPER_CPP_SRC" "@loader_path" "$DEST_BIN/whisper-server"
# install_name_tool invalidates the code signature on arm64 — a copy with a
# broken signature refuses to launch. Ad-hoc re-sign restores it.
codesign -s - -f "$DEST_BIN/whisper-server"

echo "-- Verifying rpath --"
rpath_line=$(otool -l "$DEST_BIN/whisper-server" | grep -A2 LC_RPATH | grep "path " || true)
echo "$rpath_line"
if [[ "$rpath_line" != *"@loader_path"* ]]; then
  echo "ERROR: rpath patch did not take effect." >&2
  exit 1
fi

echo "-- Smoke test (spawn, hit /inference, kill) --"
# NOTE: on a genuinely fresh binary path, macOS's Metal shader compiler
# does a one-time cold compile that took ~7.5s in testing (subsequent runs
# at the SAME path are ~0.01-0.15s — the OS caches per-path, not just by
# shader content). This smoke test's spawn is what pays that one-time cost
# NOW, during setup, so the app's own READY_TIMEOUT_MS=4000ms budget (which
# assumes a warm path) is never on the hook for it during a live dictation.
PORT=58199
"$DEST_BIN/whisper-server" -m "$DEST_MODEL" --host 127.0.0.1 --port "$PORT" \
  -l hi -nt -bs 1 -bo 1 -t 4 >/tmp/stayfree-whisper-setup-smoke.log 2>&1 &
SMOKE_PID=$!
trap 'kill -9 "$SMOKE_PID" 2>/dev/null || true' EXIT

ready=0
# Generous window: a genuinely cold Metal shader compile on a fresh path
# measured ~7.5s in testing — 400 * 0.05s = 20s comfortably covers it.
for _ in $(seq 1 400); do
  if curl -sS -m 0.3 -o /dev/null http://127.0.0.1:"$PORT"/ 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.05
done

if [[ "$ready" != "1" ]]; then
  echo "ERROR: whisper-server did not become ready. Log:" >&2
  cat /tmp/stayfree-whisper-setup-smoke.log >&2
  exit 1
fi

echo "OK: server responded. Setup complete."
echo
echo "Assets installed at: $DEST_ROOT"
echo "You can now run StayFree — the whisper sidecar will start automatically."
