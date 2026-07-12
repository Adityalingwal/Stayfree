/* Read webpack-dev-server overlay content from the widget page */
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
    const frames = [...document.querySelectorAll('#webpack-dev-server-client-overlay')];
    return JSON.stringify(frames.map(f => {
      const cs = getComputedStyle(f);
      let text = null;
      try { text = f.contentDocument ? f.contentDocument.body.innerText.slice(0, 1500) : 'NO contentDocument'; }
      catch(e) { text = 'ERR: ' + e.message; }
      return { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, text };
    }));
  })()`;
  const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  console.log(JSON.stringify(JSON.parse(res.result.value), null, 1));
  ws.close();
  process.exit(0);
});
