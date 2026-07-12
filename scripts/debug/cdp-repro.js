/* Reproduce rapid open/close and sample geometry every frame.
   Usage: node cdp-repro.js <ws-url> <openMs>  (openMs = how long to stay open) */
const WebSocket = require("ws");
const ws = new WebSocket(process.argv[2]);
const OPEN_MS = Number(process.argv[3] || 150);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve) => {
    const m = ++id;
    pending.set(m, resolve);
    ws.send(JSON.stringify({ id: m, method, params }));
  });
}
ws.on("message", (d) => {
  const msg = JSON.parse(d.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result || msg.error);
    pending.delete(msg.id);
  }
});
ws.on("open", async () => {
  const expr = `(async () => {
    const samples = [];
    const t0 = performance.now();
    let stop = false;
    function sample() {
      if (stop) return;
      const pill = document.querySelector('.widget-pill');
      const content = document.querySelector('.pill-content');
      const wf = document.querySelector('.wf');
      const s = { t: Math.round(performance.now() - t0) };
      if (pill) {
        const r = pill.getBoundingClientRect();
        s.pill = { x: +r.x.toFixed(1), w: +r.width.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1) };
        s.pillTransform = getComputedStyle(pill).transform;
        s.pillClass = pill.className;
      }
      if (content) {
        const r = content.getBoundingClientRect();
        const cs = getComputedStyle(content);
        s.content = { x: +r.x.toFixed(1), w: +r.width.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1) };
        s.cTransform = cs.transform;
        s.cLeft = cs.left;
        s.cPosition = cs.position;
        s.cOpacity = cs.opacity;
        s.cInline = content.getAttribute('style');
      } else { s.content = null; }
      if (wf) {
        const r = wf.getBoundingClientRect();
        s.wf = { x: +r.x.toFixed(1), w: +r.width.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1) };
      }
      samples.push(s);
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
    window.electron.startWidgetRecording();
    await new Promise(r => setTimeout(r, ${OPEN_MS}));
    window.electron.cancelWidgetRecording();
    await new Promise(r => setTimeout(r, 800));
    stop = true;
    return JSON.stringify(samples);
  })()`;
  const res = await send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    timeout: 10000,
  });
  if (!res.result || res.result.value === undefined) {
    console.log("EVAL PROBLEM:", JSON.stringify(res).slice(0, 800));
    process.exit(1);
  }
  const samples = JSON.parse(res.result.value);
  // Print compact: only frames where content exists; flag center mismatch
  for (const s of samples) {
    if (!s.content) {
      console.log(`t=${s.t} pill(cx=${s.pill?.cx} w=${s.pill?.w}) content=GONE class=${s.pillClass}`);
      continue;
    }
    const drift = (s.content.cx - s.pill.cx).toFixed(1);
    const flag = Math.abs(drift) > 2 ? "  <<< OFF-CENTER" : "";
    console.log(
      `t=${s.t} pillW=${s.pill.w} pillCx=${s.pill.cx} contentCx=${s.content.cx} drift=${drift} op=${s.cOpacity} cT=${s.cTransform.slice(0, 40)} cL=${s.cLeft} pos=${s.cPosition}${flag}`,
    );
    if (Math.abs(drift) > 2) console.log(`   inline="${s.cInline}"`);
  }
  ws.close();
  process.exit(0);
});
