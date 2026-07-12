/* Inject a persistent glitch detector into the widget page. It samples every
   frame; on any off-center content OR wf-vs-pill drift it console.errors a
   [GLITCH] line (picked up by the running cdp-watch monitor). Also logs every
   widget state change with timestamp. */
const WebSocket = require("ws");
const ws = new WebSocket(process.argv[2]);
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
  const expr = `(() => {
    if (window.__glitchArmed) return 'ALREADY ARMED';
    window.__glitchArmed = true;
    // State timeline
    window.electron.onWidgetState((_e, s) => {
      console.error('[STATE] ' + Math.round(performance.now()) + ' -> ' + s);
    });
    let lastReport = 0;
    function tick() {
      const pill = document.querySelector('.widget-pill');
      const content = document.querySelector('.pill-content');
      if (pill && content) {
        const pr = pill.getBoundingClientRect();
        const cr = content.getBoundingClientRect();
        const pillCx = pr.x + pr.width / 2;
        const contentCx = cr.x + cr.width / 2;
        const drift = contentCx - pillCx;
        const wf = document.querySelector('.wf');
        let wfDrift = 0;
        if (wf) {
          const wr = wf.getBoundingClientRect();
          wfDrift = (wr.x + wr.width / 2) - pillCx;
        }
        // Processing intentionally glides the bars to -13px (spinner room).
        // Only flag drift beyond the designed offset, with slack for the
        // spring's travel/overshoot.
        const processing = pill.className.includes('pill-processing');
        const wfBad = processing
          ? (wfDrift > 2 || wfDrift < -24)
          : Math.abs(wfDrift) > 8;
        const now = performance.now();
        if ((Math.abs(drift) > 2 || wfBad) && now - lastReport > 1000) {
          lastReport = now;
          const cs = getComputedStyle(content);
          console.error('[GLITCH] t=' + Math.round(now)
            + ' drift=' + drift.toFixed(1)
            + ' wfDrift=' + wfDrift.toFixed(1)
            + ' pill{x:' + pr.x.toFixed(0) + ',w:' + pr.width.toFixed(0) + ',cls:' + pill.className.replace('widget-pill ','') + '}'
            + ' content{x:' + cr.x.toFixed(0) + ',w:' + cr.width.toFixed(0) + ',op:' + (+cs.opacity).toFixed(2) + ',tf:' + cs.transform + ',left:' + cs.left + ',pos:' + cs.position + '}'
            + ' inline=' + JSON.stringify(content.getAttribute('style')));
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return 'ARMED';
  })()`;
  const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  console.log("Detector:", res.result && res.result.value);
  ws.close();
  process.exit(0);
});
