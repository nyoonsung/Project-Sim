// 웹소켓 연결 (같은 출처, 쿠키 세션)
export class Net {
  constructor(onMsg, onClose) {
    this.onMsg = onMsg;
    this.onClose = onClose;
    this.ws = null;
    this.rtt = 0;
  }
  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "pong") { this.rtt = performance.now() - m.c; return; }
      this.onMsg(m);
    };
    this.ws.onclose = (e) => this.onClose(e);
    this.ws.onopen = () => { this.pinger = setInterval(() => this.send({ t: "ping", c: performance.now() }), 3000); };
    return new Promise((res) => this.ws.addEventListener("open", res, { once: true }));
  }
  send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { clearInterval(this.pinger); this.ws?.close(); }
}
