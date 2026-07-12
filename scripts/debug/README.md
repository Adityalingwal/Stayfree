# UI debugging via CDP (Chrome DevTools Protocol)

Frame-level, number-driven debugging of the widget/recorder windows — no
screen recording needed. Proven workflow from the 2026-07-12 session that
found the bars-drift glitch, the dev-server overlay black box, and the
background-throttling freeze.

## Setup

```bash
npm start -- -- --remote-debugging-port=9333
```

List debuggable pages (grab `webSocketDebuggerUrl` / target id):

```bash
curl -s http://127.0.0.1:9333/json
# widget window = url ending in #widget, recorder = no hash
```

## Scripts (run with `node scripts/debug/<script> <ws-url> [args]`)

| Script | What it does |
|---|---|
| `cdp-inspect.js` | One-shot: dumps pill/content DOM state (rects, computed + inline styles), saves a PNG screenshot of the page, prints buffered console. |
| `cdp-repro.js <ws> <openMs>` | Automated rapid open/close: `startWidgetRecording` → `cancelWidgetRecording` with controlled timing, sampling geometry **every frame**; prints per-frame drift table. |
| `cdp-repro2.js` (session scratch) | Double-toggle variant (open→cancel→open→cancel). |
| `cdp-armdetector.js` | Injects a **persistent rAF glitch detector** into the widget page: every frame it compares pill-center vs content-center vs bars-center; on real drift it `console.error`s a `[GLITCH]` line with full geometry. Whitelist designed motion here, or every transition frame false-alarms. |
| `cdp-watch.js` | Long-running watcher: attaches to all pages, relays `console.error`/`warning` + uncaught exceptions (incl. `[GLITCH]`/`[STATE]` lines from the detector). Pipe through `grep -v '\[STATE\]'` to keep it quiet. |
| `cdp-overlay.js` | Reads the webpack-dev-server error-overlay iframe's text — when a mystery fullscreen box appears, the error message is written inside it. |

## The method

1. **Reproduce with numbers, not eyes**: inject a rAF sampler; measure
   `getBoundingClientRect()` of pill vs content vs bars every frame.
   `drift` (content vs pill center) separates "centering broke" from
   "something inside pushed the bars" (`wfDrift`).
2. **Let the user reproduce the real flow** with the detector armed —
   hotkey paths can't be automated (and `stopWidgetRecording` triggers a
   real paste; only ever automate with `cancelWidgetRecording`).
3. **Read the state timeline** (`[STATE]` lines) alongside glitch frames —
   fast state flips (processing for 25ms) are findings in themselves.
4. **Fix → `npm run package` + lint → restart app → re-arm detector →
   user re-test → monitor silence = verified.**

## Hard-won gotchas

- **webpack-dev-server overlay** paints a fullscreen black iframe over our
  transparent chromeless windows on any compile warning/runtime error —
  looks like a giant black/white box floating over the desktop. Disabled in
  `forge.config.ts` (`devServer.client.overlay: false`); the
  `@emotion/is-prop-valid` warning that triggered it is aliased to `false`
  in `webpack.renderer.config.ts`.
- **`backgroundThrottling: false` is mandatory** on the widget + recorder
  windows: they are never focused, and a throttled page runs rAF at <1Hz —
  framer springs/AnimatePresence freeze mid-flight (pill stuck at
  processing size in idle state).
- **Never `Page.reload` the widget window** — the reloaded page can come
  back throttled/stuck. Restart the app instead.
- Renderer `console.*` does NOT show up in the `npm start` terminal
  (ELECTRON_ENABLE_LOGGING was unreliable here) — CDP is the reliable tap.
- Detector thresholds must whitelist **designed** motion (spring
  mid-flight, exit-clone frames) or every transition false-alarms.
