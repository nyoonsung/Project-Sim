// 링크 데모용 "서버 연결": 같은 World 엔진을 브라우저 안에서 돌리고 메시지를 JSON으로 주고받는다
import { World } from "../server/game/world.js";

let world = null;
export class LocalNet {
  constructor(onMsg, onClose) { this.onMsg = onMsg; this.onClose = onClose; this.rtt = 0; }
  async connect() {
    world ??= new World();
    const g = globalThis.__game;
    const name = g?.localName ?? "모험가";
    this.conn = {
      user: { id: 1, username: name, role: "player", muted_until: 0 },
      ip: "local",
      send: (obj) => { const s = typeof obj === "string" ? obj : JSON.stringify(obj); queueMicrotask(() => this.onMsg(JSON.parse(s))); },
      close: () => {},
    };
    world.onOpen(this.conn);
    addEventListener("beforeunload", () => world.saveAll());
    setInterval(() => world.saveAll(), 10_000);
  }
  send(o) {
    try { world.onMessage(this.conn, JSON.parse(JSON.stringify(o))); } catch (e) { console.error(e); }
  }
  close() {}
}
