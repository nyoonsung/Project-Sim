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
    const ws = this.ws;
    ws.onclose = (e) => { clearInterval(this.pinger); if (ws === this.ws) this.onClose(e); };
    ws.onopen = () => { clearInterval(this.pinger); this.pinger = setInterval(() => this.send({ t: "ping", c: performance.now() }), 5000); };
    // 열리면 성공, 열리기 전에 닫히면 실패 (자동 재접속이 다시 시도)
    return new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("close", () => rej(new Error("closed")), { once: true }); });
  }
  send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { clearInterval(this.pinger); this.ws?.close(); }
}
