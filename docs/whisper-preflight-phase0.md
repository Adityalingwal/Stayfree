# Phase 0 Preflight Results — Local whisper.cpp Migration

Ran 2026-07-30 on Apple M3 / 8GB, against a disposable copy of
`~/stt-testing/whisper.cpp/build/bin/whisper-server` + `ggml-swift-q8_0.bin`
(82MB). Full detail in the implementation findings file (scratchpad,
non-durable); this is the durable summary the plan requires before any app
code.

## 1. rpath — CONFIRMED blocker, fix verified

`otool -l` on the raw copy showed `LC_RPATH = /Users/mac/stt-testing/whisper.cpp/build/bin`
(absolute, from the build machine). Fixed with:

```
install_name_tool -rpath "/Users/mac/stt-testing/whisper.cpp/build/bin" "@loader_path" whisper-server
codesign -s - -f whisper-server   # re-sign after install_name_tool (required on arm64)
```

**Self-containment proof:** renamed `~/stt-testing/whisper.cpp` → `.bak`,
started the patched copy from its disposable dir, confirmed Metal init
(`GPU name: MTL0 (Apple M3)`, `using MTL0 backend`) and a real `/inference`
transcription succeeded with the source tree absent, then killed the process
and renamed the source dir back immediately. Verified restored before
continuing.

`setup-whisper.sh` must run `install_name_tool` + re-`codesign -s -` on every
copy.

## 2. Readiness signal

Raced HTTP requests against process spawn: the server's HTTP listener does
not accept connections until the model + Metal context are fully
initialized — the first successful TCP response (any endpoint, incl. plain
`GET /`) already served a correct `/inference` transcription in the same
race test. So **first successful HTTP response == ready**; no separate
stdout-marker parse is needed. `ensureReady()` can poll a lightweight GET
until it succeeds or `READY_TIMEOUT_MS` (4000ms) elapses.

## 3. Degenerate-input matrix

| Input | Result |
|---|---|
| 0-byte file | HTTP 400 "Invalid request", server stays alive |
| Valid WAV header, 0 samples | HTTP 400 "Invalid request", server stays alive |
| 1-sample WAV | HTTP 200, `{"text":""}` → maps to `NO_TRANSCRIPT` |
| ~300ms tone | HTTP 200, correct short transcript |
| 3s pure silence, no `-sns` | HTTP 200, **hallucinated** `"Haan."` (non-empty, would paste garbage) |
| 3s pure silence, with `-sns` | HTTP 200, **still hallucinated** `"Haan."` — `-sns` does NOT fix it |
| 5 short gold clips (<1s) with `-sns` | All 5 matched Test-4 reference exactly — no regression |
| Concurrent 2 simultaneous POSTs | Both HTTP 200, correct + identical transcripts, no crash |
| SIGKILL mid-request | Client sees curl 52 / HTTP 000 (connection reset), clean failure, no hang |
| `--tmp-dir` pointing at a non-existent directory | Server starts fine, HTTP 200 (flag is ffmpeg-only per `--help`, unused since we never pass `--convert`) |

**Decision (per plan's decisive rule): do NOT adopt `-sns`.** It passed the
regression half (no false suppression of real short speech) but failed the
one thing it exists for (did not remove the confirmed silence hallucination).
D7's default (no `-sns`) stands. **Silence hallucination is real and
unmitigated — flagged as a ship/no-ship item for the owner in the final
report; NOT fixed with an energy-gate per the plan's explicit prohibition.**

## 4. Long-clip latency (validates D5 budget)

Built a 134.6s clip by concatenating 36 gold WAVs via `ffmpeg`, sliced to
30/60/120s, ran sequentially (not parallel — heat discipline):

| Clip | `/inference` wall time |
|---|---|
| 30s | 0.32s |
| 60s | 0.73s |
| 120s | 1.22s |

All far under `ASR_REQUEST_TIMEOUT_MS` (4500ms). No length cap needed per
the plan's "cap only if measured necessary" rule.

## Verdict

Phase 0 passes. Proceeding to Phase 1 (standalone modules) per the plan.
