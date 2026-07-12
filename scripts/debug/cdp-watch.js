/* Persistent CDP watcher: prints runtime exceptions + console errors from all
   StayFree renderer pages. One line per event (for Monitor). */
const http = require("http");
const WebSocket = require("ws");

const attached = new Set();

function label(url) {
  if (url.includes("#widget")) return "WIDGET";
  if (url.includes("#settings")) return "SETTINGS";
  if (url.includes("#onboarding")) return "ONBOARDING";
  return "RECORDER";
}

function attach(target) {
  if (attached.has(target.id)) return;
  attached.add(target.id);
  const tag = label(target.url);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  ws.on("open", () => {
    ws.send(JSON.stringify({ id: ++id, method: "Runtime.enable" }));
    console.log(`ATTACHED ${tag}`);
  });
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === "Runtime.exceptionThrown") {
      const e = msg.params.exceptionDetails;
      const desc = (e.exception && e.exception.description) || e.text || "";
      console.log(`${tag} EXCEPTION: ${desc.split("\n").slice(0, 3).join(" | ")}`);
    } else if (
      msg.method === "Runtime.consoleAPICalled" &&
      (msg.params.type === "error" || msg.params.type === "warning")
    ) {
      const text = msg.params.args
        .map((a) => a.value ?? a.description ?? "")
        .join(" ")
        .slice(0, 300);
      console.log(`${tag} console.${msg.params.type}: ${text}`);
    }
  });
  ws.on("close", () => {
    attached.delete(target.id);
    console.log(`DETACHED ${tag}`);
  });
  ws.on("error", () => attached.delete(target.id));
}

function poll() {
  http
    .get("http://127.0.0.1:9333/json", (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          JSON.parse(body)
            .filter((t) => t.type === "page")
            .forEach(attach);
        } catch (_) {
          /* ignore */
        }
      });
    })
    .on("error", () => {
      /* app not up yet / restarted */
    });
}

poll();
setInterval(poll, 3000);
