// 거래 통합 테스트: 서버를 띄우고 두 봇이 아이템·골드를 주고받는다 (복사·바꿔치기·잠금·취소 검사)
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 3900 + Math.floor(Math.random() * 90), BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "psim-tr-"));
const srv = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server/main.js"], { env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, "t.db"), ADMIN_KEY: "test-admin-key-123" }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; srv.stdout.on("data", (d) => (log += d)); srv.stderr.on("data", (d) => (log += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, n) => { console.log(`${c ? "✓" : "✗"} ${n}`); if (!c) fails++; };
async function api(path, body, cookie) {
  const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})), cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}
class Bot {
  constructor(cookie) { this.cookie = cookie; this.msgs = []; this.trade = undefined; this.notes = []; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`${BASE.replace("http", "ws")}/ws`, { headers: { Cookie: this.cookie, Origin: BASE } });
      this.ws.on("open", () => res(this)); this.ws.on("error", rej);
      this.ws.on("message", (d) => {
        const m = JSON.parse(d); this.msgs.push(m);
        if (m.t === "hello" || m.t === "char") this.char = m.char;
        if (m.t === "trade") { this.trade = m.st; if (m.msg) this.notes.push(m.msg); }
        if (m.t === "tradeReq") this.req = m.from;
        if (m.t === "notice" || (m.t === "ev" && m.list?.some?.((e) => e.e === "msg"))) this.notes.push(m.text ?? m.list.map((e) => e.text).join("/"));
      });
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
}
async function mk(name) { const r = await api("/api/register", { username: name, password: "password1" }); return new Bot(r.cookie).connect(); }

try {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + "/"); break; } catch { await sleep(100); } }
  const A = await mk("상인가"), B = await mk("상인나");
  await sleep(400);
  const gm = (await api("/api/admin/login", { key: "test-admin-key-123" })).cookie;
  const list = (await api("/api/gm/players?q=상인", null, gm)).j.list;
  for (const p of list) await api(`/api/gm/player/${p.id}/edit`, { gold: 50000 }, gm);
  await sleep(300);
  // 아이템 준비: 둘 다 무기·보조 장비를 가방으로
  for (const b of [A, B]) { b.send({ t: "unequip", slot: "weapon" }); b.send({ t: "unequip", slot: "offhand" }); }
  await sleep(400);
  ok(A.char.inv.length === 2 && B.char.inv.length === 2, "가방에 아이템 2개씩");
  ok(A.char.gold === 50000, "골드 50000");
  const [aw, ao] = A.char.inv, [bw] = B.char.inv;

  // 신청·수락
  A.send({ t: "trade", op: "request", name: "상인나" }); await sleep(200);
  ok(B.req === "상인가", "거래 신청 받음");
  B.send({ t: "trade", op: "accept", name: "상인가" }); await sleep(200);
  ok(A.trade && B.trade && A.trade.with === "상인나", "거래창 열림");

  // 잠긴 아이템은 못 올림
  A.send({ t: "lock", uid: ao.uid }); await sleep(150);
  A.send({ t: "trade", op: "set", uids: [ao.uid] }); await sleep(150);
  ok(A.trade.mine.items.length === 0, "잠긴 아이템 거부");
  A.send({ t: "lock", uid: ao.uid }); await sleep(150);

  // 올리기
  A.send({ t: "trade", op: "set", uids: [aw.uid], gold: 1000 }); await sleep(150);
  B.send({ t: "trade", op: "set", uids: [bw.uid], gold: 500 }); await sleep(150);
  ok(B.trade.theirs.items[0]?.uid === aw.uid && B.trade.theirs.gold === 1000, "상대 제안이 보임");
  // 가진 것보다 많은 골드 거부
  A.send({ t: "trade", op: "set", gold: 999999 }); await sleep(150);
  ok(A.trade.mine.gold === 1000, "골드 초과 거부");
  // 올린 아이템 팔기 막기
  A.send({ t: "sell", uid: aw.uid }); await sleep(150);
  ok(A.char.inv.some((i) => i.uid === aw.uid), "거래에 올린 아이템 판매 막힘");
  // 한 명이 '거래하기' → 상대에게 요청(수락 창). 그 사이 조건이 바뀌면 요청이 풀림
  A.send({ t: "trade", op: "confirm", ver: A.trade.ver }); await sleep(150);
  ok(A.trade.mine.ok && B.trade.theirs.ok, "한 명이 거래하기 → 상대 쪽에 요청 표시");
  ok(A.char.inv.some((i) => i.uid === aw.uid), "상대가 수락하기 전엔 안 바뀜");
  B.send({ t: "trade", op: "set", gold: 400 }); await sleep(150);
  ok(!A.trade.mine.ok && !B.trade.theirs.ok, "조건이 바뀌면 요청이 풀림");
  // 거절
  A.send({ t: "trade", op: "confirm", ver: A.trade.ver }); await sleep(150);
  B.send({ t: "trade", op: "reject" }); await sleep(150);
  ok(!A.trade.mine.ok && A.trade !== null, "거절하면 요청만 풀리고 거래창은 유지");
  // 상대가 조건을 바꾼 직후 옛 화면(옛 버전)으로 수락하면 거절돼야 함 (바꿔치기 사기 방지)
  A.send({ t: "trade", op: "confirm", ver: A.trade.ver }); await sleep(150);
  const staleVer = B.trade.ver;
  A.send({ t: "trade", op: "set", gold: 0 }); await sleep(150);
  B.send({ t: "trade", op: "confirm", ver: staleVer }); await sleep(150);
  ok(!B.trade.mine.ok, "조건이 바뀐 뒤 옛 화면으로 누른 수락은 거절");
  A.send({ t: "trade", op: "set", gold: 1000 }); await sleep(150);
  // 수락 → 교환
  A.send({ t: "trade", op: "confirm", ver: A.trade.ver }); await sleep(150);
  B.send({ t: "trade", op: "confirm", ver: B.trade.ver }); await sleep(300);
  ok(A.trade === null && B.trade === null, "거래 종료");
  ok(A.char.gold === 50000 - 1000 + 400 && B.char.gold === 50000 - 400 + 1000, `골드 교환 (${A.char.gold}, ${B.char.gold})`);
  ok(A.char.inv.length === 2 && B.char.inv.length === 2, "아이템 수 유지 (복사 없음)");
  ok(A.char.inv.some((i) => i.name === bw.name) && B.char.inv.some((i) => i.name === aw.name), "아이템 교환됨");
  ok(new Set(B.char.inv.map((i) => i.uid)).size === B.char.inv.length, "받은 아이템 번호 충돌 없음");

  // 취소
  A.send({ t: "trade", op: "request", name: "상인나" }); await sleep(200);
  B.send({ t: "trade", op: "accept", name: "상인가" }); await sleep(200);
  B.send({ t: "trade", op: "cancel" }); await sleep(200);
  ok(A.trade === null && B.trade === null && A.notes.some((n) => n.includes("취소")), "취소하면 둘 다 닫힘");
  // 확정 직전 아이템을 장착해서 빼면 → 교환 안 되고 준비 풀림 (장착은 막힘)
  A.send({ t: "trade", op: "request", name: "상인나" }); await sleep(200);
  B.send({ t: "trade", op: "accept", name: "상인가" }); await sleep(200);
  const it = A.char.inv[0];
  A.send({ t: "trade", op: "set", uids: [it.uid] }); await sleep(150);
  A.send({ t: "equip", uid: it.uid }); await sleep(150);
  ok(A.char.inv.some((i) => i.uid === it.uid), "거래에 올린 아이템 장착 막힘");
  // 연결 끊기면 취소
  A.ws.close(); await sleep(400);
  ok(B.trade === null, "상대가 나가면 거래 취소");
} catch (e) { console.error(e); fails++; }
srv.kill();
if (fails) { console.log(log.slice(-2000)); }
console.log(fails ? `${fails} FAIL` : "ALL PASS");
process.exit(fails ? 1 : 0);
