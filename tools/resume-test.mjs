// 서버 재시작(업데이트 배포) 테스트: 던전에 있던 사람이 다시 접속하면 같은 층으로 돌아오고 파티도 다시 묶이는지
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 4100 + Math.floor(Math.random() * 90), BASE = `http://localhost:${PORT}`;
const DB = join(mkdtempSync(join(tmpdir(), "psim-rs-")), "t.db");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv, log = "", fails = 0;
const ok = (c, n) => { console.log(`${c ? "✓" : "✗"} ${n}`); if (!c) fails++; };
async function start() {
  srv = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server/main.js"], { env: { ...process.env, PORT: String(PORT), DB_PATH: DB, ADMIN_KEY: "test-admin-key-123" }, stdio: ["ignore", "pipe", "pipe"] });
  srv.stdout.on("data", (d) => (log += d)); srv.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 80; i++) { try { await fetch(BASE + "/api/status"); return; } catch { await sleep(100); } }
}
async function api(path, body, cookie) {
  const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})), cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}
class Bot {
  constructor(cookie) { this.cookie = cookie; this.notes = []; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`${BASE.replace("http", "ws")}/ws`, { headers: { Cookie: this.cookie, Origin: BASE } });
      this.ws.on("open", () => res(this)); this.ws.on("error", rej);
      this.ws.on("message", (d) => {
        const m = JSON.parse(d);
        if (m.t === "map") this.map = m;
        if (m.t === "hello" || m.t === "char") this.char = m.char;
        if (m.t === "party") this.party = m.members;
        if (m.t === "invite") this.inv = m.from;
        if (m.t === "ev") for (const e of m.list) if (e.text) this.notes.push(e.text);
      });
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
}
const where = (b) => b.map ? `${b.map.floor ? "dungeon" : "town"}:${b.map.floor}` : "?";

try {
  await start();
  const ca = (await api("/api/register", { username: "복귀가", password: "password1" })).cookie;
  const cb = (await api("/api/register", { username: "복귀나", password: "password1" })).cookie;
  const cc = (await api("/api/register", { username: "복귀다", password: "password1" })).cookie;
  let A = await new Bot(ca).connect(), B = await new Bot(cb).connect(), C = await new Bot(cc).connect();
  await sleep(400);
  // A·B 파티 → 1층, C 혼자 1층
  A.send({ t: "party", op: "invite", name: "복귀나" }); await sleep(200);
  B.send({ t: "party", op: "accept", name: "복귀가" }); await sleep(200);
  A.send({ t: "enter", floor: 1 }); C.send({ t: "enter", floor: 1 }); await sleep(600);
  ok(where(A) === "dungeon:1" && where(B) === "dungeon:1" && where(C) === "dungeon:1", `던전 입장 (${where(A)}, ${where(B)}, ${where(C)})`);
  const st = (await api("/api/status")).j;
  ok(st.online === 3 && st.dungeon === 3, `상태 확인 API (${JSON.stringify(st)})`);
  // 배포처럼 서버를 갑자기 끔
  srv.kill("SIGKILL"); await sleep(500);
  await start();
  A = await new Bot(ca).connect(); await sleep(500);
  ok(where(A) === "dungeon:1", `재시작 후 A가 1층으로 복귀 (${where(A)})`);
  ok(A.notes.some((t) => t.includes("돌아왔어요")), "복귀 안내 메시지");
  B = await new Bot(cb).connect(); await sleep(500);
  ok(where(B) === "dungeon:1", `B도 1층으로 복귀 (${where(B)})`);
  ok(A.map.room === B.map.room, `같은 방 (${A.map.room}, ${B.map.room})`);
  ok(B.party?.length === 2 && A.party?.length === 2, `파티 다시 묶임 (${B.party?.length})`);
  C = await new Bot(cc).connect(); await sleep(500);
  ok(where(C) === "dungeon:1" && C.party == null, `혼자였던 C는 혼자 복귀 (${where(C)})`);
  // 던전에서 신화 장착 직후 서버가 갑자기 꺼져도 장착이 유지되는지 (예전엔 최대 30초치 변화가 날아감)
  const gm = (await api("/api/admin/login", { key: "test-admin-key-123" })).cookie;
  const aid = (await api("/api/gm/players?q=복귀가", null, gm)).j.list[0].id;
  await api(`/api/gm/player/${aid}/give`, { rarity: "신화", ilvl: 1, slot: "weapon" }, gm); await sleep(300);
  const my = A.char.inv.find((i) => i.rarity === "신화");
  A.send({ t: "equip", uid: my.uid }); await sleep(150);
  ok(A.char.equip.weapon?.rarity === "신화", "던전에서 신화 장착");
  srv.kill("SIGKILL"); await sleep(400); await start();
  A = await new Bot(ca).connect(); await sleep(500);
  ok(A.char.equip.weapon?.rarity === "신화" && A.char.equip.weapon?.name === my.name, `재시작 직후에도 신화 장착 유지 (${A.char.equip.weapon?.name})`);
  A.send({ t: "town" }); await sleep(400);
  ok(A.char.equip.weapon?.rarity === "신화", "마을로 돌아가도 신화 그대로");
  B = await new Bot(cb).connect(); C = await new Bot(cc).connect(); await sleep(400);
  // 마을로 돌아간 뒤 재시작하면 마을에서 시작
  C.send({ t: "town" }); await sleep(400);
  srv.kill("SIGKILL"); await sleep(500); await start();
  C = await new Bot(cc).connect(); await sleep(500);
  ok(where(C) === "town:0", `마을에 있던 사람은 마을에서 (${where(C)})`);
  // 정상적으로 나간 사람(던전에서 끊기고 30초 지나 정리됨)은 마을에서 → finishClose가 기록을 지움 (로직 확인만)
} catch (e) { console.error(e); fails++; }
srv?.kill("SIGKILL");
if (fails) console.log(log.slice(-1500));
console.log(fails ? `${fails} FAIL` : "ALL PASS");
process.exit(fails ? 1 : 0);
