/* Rapid DOUBLE toggle: open->cancel->open->cancel with tight timings.
   Samples every frame; prints only off-center frames + summary. */
const WebSocket = require("ws");
const ws = new WebSocket(process.argv[2]);
const T1 = Number(process.argv[3] || 80); // first open duration
const GAP = Number(process.argv[4] || 60); // idle gap before reopen
const T2 = Number(process.argv[5] || 80); // second open duration
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
      const contents = [...document.querySelectorAll('.pill-content')];
      const s = { t: Math.round(performance.now() - t0), nContent: contents.length };
      if (pill) {
        const r = pill.getBoundingClientRect();
        s.pill = { x: +r.x.toFixed(1), w: +r.width.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1) };
      }
      s.contents = contents.map(c => {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        return { x: +r.x.toFixed(1), w: +r.width.toFixed(1), cx: +(r.x + r.width/2).toFixed(1),
                 op: +(+cs.opacity).toFixed(2), tf: cs.transform, left: cs.left, inline: c.getAttribute('style') };
      });
      samples.push(s);
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
    window.electron.startWidgetRecording();
    await new Promise(r => setTimeout(r, ${T1}));
    window.electron.cancelWidgetRecording();
    await new Promise(r => setTimeout(r, ${GAP}));
    window.electron.startWidgetRecording();
    await new Promise(r => setTimeout(r, ${T2}));
    window.electron.cancelWidgetRecording();
    await new Promise(r => setTimeout(r, 900));
    stop = true;
    return JSON.stringify(samples);
  })()`;
  const res = await send("Runtime.evaluate", {
    expression: expr, returnByValue: true, awaitPromise: true, timeout: 15000,
  });
  if (!res.result || res.result.value === undefined) {
    console.log("EVAL PROBLEM:", JSON.stringify(res).slice(0, 800));
    process.exit(1);
  }
  const samples = JSON.parse(res.result.value);
  let bad = 0, dupFrames = 0;
  for (const s of samples) {
    if (s.nContent > 1) { dupFrames++; console.log("t=" + s.t + " !! " + s.nContent + " CONTENT NODES: " + JSON.stringify(s.contents)); continue; }
    const c = s.contents[0];
    if (!c) continue;
    const drift = c.cx - s.pill.cx;
    if (Math.abs(drift) > 2) {
      bad++;
      console.log("t=" + s.t + " OFF-CENTER drift=" + drift.toFixed(1) + " pill(cx=" + s.pill.cx + ",w=" + s.pill.w + ") content(cx=" + c.cx + ",w=" + c.w + ",op=" + c.op + ") tf=" + c.tf.slice(0, 44) + " left=" + c.left + " inline=\"" + c.inline + "\"");
    }
  }
  console.log("SUMMARY: frames=" + samples.length + " offCenter=" + bad + " dupContentFrames=" + dupFrames);
  ws.close();
  process.exit(0);
});
