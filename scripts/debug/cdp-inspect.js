/* CDP inspector for the StayFree widget window */
const WebSocket = require("ws");

const WS_URL = process.argv[2];
const ws = new WebSocket(WS_URL);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

const consoleMsgs = [];

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg.result || msg.error);
    pending.delete(msg.id);
  } else if (msg.method === "Runtime.consoleAPICalled") {
    consoleMsgs.push(
      msg.params.type + ": " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "),
    );
  } else if (msg.method === "Runtime.exceptionThrown") {
    const e = msg.params.exceptionDetails;
    consoleMsgs.push("EXCEPTION: " + (e.exception?.description || e.text));
  }
});

ws.on("open", async () => {
  try {
    await send("Runtime.enable");
    await send("Page.enable");
    // Give buffered console events a moment
    await new Promise((r) => setTimeout(r, 1500));

    const evalExpr = `(() => {
      const pill = document.querySelector('.widget-pill');
      const content = document.querySelector('.pill-content');
      const out = {
        bodyBg: getComputedStyle(document.body).backgroundColor,
        htmlBg: getComputedStyle(document.documentElement).backgroundColor,
        appChildren: document.getElementById('app') ? document.getElementById('app').children.length : 'NO #app',
        bodyHTML: document.body.innerHTML.slice(0, 600),
      };
      if (pill) {
        const cs = getComputedStyle(pill);
        out.pill = {
          className: pill.className,
          inlineStyle: pill.getAttribute('style'),
          width: cs.width, height: cs.height, background: cs.backgroundColor,
          borderRadius: cs.borderRadius, transform: cs.transform,
        };
        out.pillRect = pill.getBoundingClientRect().toJSON();
      } else { out.pill = 'NO .widget-pill'; }
      if (content) out.contentHTML = content.innerHTML.slice(0, 200);
      return JSON.stringify(out);
    })()`;

    const res = await send("Runtime.evaluate", { expression: evalExpr, returnByValue: true });
    console.log("=== DOM/STYLE STATE ===");
    console.log(JSON.stringify(JSON.parse(res.result.value), null, 1));

    const shot = await send("Page.captureScreenshot", { format: "png" });
    if (shot.data) {
      require("fs").writeFileSync(
        "/private/tmp/claude-501/-Users-mac-Desktop-StayFree/98928484-9323-4d22-935f-0105a1f8d1b9/scratchpad/widget-page.png",
        Buffer.from(shot.data, "base64"),
      );
      console.log("=== SCREENSHOT saved ===");
    }

    console.log("=== CONSOLE (buffered) ===");
    consoleMsgs.forEach((m) => console.log(m));
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error("CDP error:", e);
    process.exit(1);
  }
});
