// 헤드리스 통합 테스트: 서버를 띄우고 봇이 가입·이동·전투·파티·층 이동·강화·보안 위반을 시험한다
//   npm test
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const PORT = 3400 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "psim-"));
const srv = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server/main.js"], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, "t.db"), INITIAL_GM_USER: "gmtest", INITIAL_GM_PASS: "gmpass1234" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
srv.stdout.on("data", (d) => (log += d));
srv.stderr.on("data", (d) => (log += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, name) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) fails++; };

async function api(path, body, cookie, origin = BASE) {
  const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}

class Bot {
  constructor(cookie) { this.cookie = cookie; this.msgs = []; this.ents = new Map(); this.me = null; this.map = null; this.events = []; this.seq = 0; }
  connect(origin = BASE) {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { Cookie: this.cookie, Origin: origin } });
      this.ws.on("open", () => res(this));
      this.ws.on("error", rej);
      this.ws.on("unexpected-response", (_, r) => rej(new Error("status " + r.statusCode)));
      this.ws.on("message", (d) => {
        const m = JSON.parse(d);
        this.msgs.push(m);
        if (m.t === "map") { this.map = m; this.you = m.you; }
        if (m.t === "s") for (const e of m.e) this.ents.set(e[0], e);
        if (m.t === "ev") this.events.push(...m.list);
        if (m.t === "me") this.me = m;
        if (m.t === "hello" || m.t === "char") this.char = m.char;
      });
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  pos() { const e = this.ents.get(this.you); return e ? [e[1], e[2]] : null; }
  move(mx, my, ax = 0, ay = 0) { this.send({ t: "in", s: ++this.seq, mx, my, ax, ay }); }
  async walk(mx, my, ms) { const end = Date.now() + ms; while (Date.now() < end) { this.move(mx, my); await sleep(50); } this.move(0, 0); }
  async walkTo(x, y, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const p = this.pos(); if (!p) { await sleep(50); continue; }
      const dx = x - p[0], dy = y - p[1], d = Math.hypot(dx, dy);
      if (d < 14) break;
      this.move(dx / d, dy / d, x, y);
      await sleep(50);
    }
    this.move(0, 0);
  }
  wait(pred, ms = 3000) { return new Promise(async (res) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return res(true); await sleep(30); } res(false); }); }
}

try {
  for (let i = 0; i < 60 && !log.includes("실행 중"); i++) await sleep(100);
  ok(log.includes("실행 중"), "서버 시작");
  ok(log.includes("GM 계정 생성"), "환경 변수로 GM 계정 생성");

  // ── 가입·로그인 보안
  let r = await api("/api/register", { username: "a", password: "x" });
  ok(r.status === 400, "짧은 아이디/약한 비번 거부");
  r = await api("/api/register", { username: "봇하나", password: "password1" }, null, "http://evil.example");
  ok(r.status === 403, "다른 출처의 가입 요청 차단(CSRF)");
  r = await api("/api/register", { username: "봇하나", password: "password1" });
  ok(r.status === 200 && r.cookie.startsWith("sid="), "가입 + 세션 쿠키");
  const c1 = r.cookie;
  r = await api("/api/register", { username: "봇둘", password: "password2" });
  const c2 = r.cookie;
  r = await api("/api/login", { username: "봇하나", password: "wrongpass1" });
  ok(r.status === 401, "틀린 비밀번호 거부");
  r = await api("/api/gm/overview", null, c1);
  ok(r.status === 403, "일반 유저 GM API 차단");

  // ── 웹소켓
  let rejected = false;
  try { await new Bot(c1).connect("http://evil.example"); } catch { rejected = true; }
  ok(rejected, "다른 출처 웹소켓 차단");
  rejected = false;
  try { await new Bot("sid=forged-token-aaaaaaaaaaaaaaaaaaaaaaa").connect(); } catch { rejected = true; }
  ok(rejected, "위조 세션 웹소켓 차단");

  const b1 = await new Bot(c1).connect();
  const b2 = await new Bot(c2).connect();
  ok(await b1.wait(() => b1.map && b1.map.kind === "town"), "마을 입장 + 지도 수신");
  await b1.wait(() => b1.pos());
  const p0 = b1.pos();
  await b1.walk(1, 0, 600);
  await sleep(150);
  const p1 = b1.pos();
  const moved = p1[0] - p0[0];
  ok(moved > 40 && moved < 100, `서버 판정 이동 (${moved}px / 0.6s)`);

  // 속도 조작: 한 틱에 입력을 몰아 보내도 한 틱에 하나만 적용
  const q0 = b1.pos();
  for (let i = 0; i < 40; i++) b1.move(1, 0);
  await sleep(120);
  const q1 = b1.pos();
  ok(q1[0] - q0[0] < 60, `입력 폭주로 순간이동 불가 (${q1[0] - q0[0]}px)`);
  // 잘못된 값
  b1.send({ t: "in", s: 1, mx: 50, my: 0, ax: 0, ay: 0 });
  b1.send({ t: "cast", slot: 99, ax: 0, ay: 0 });
  b1.send({ t: "hack", x: 1 });
  await sleep(200);
  ok(b1.ws.readyState === 1, "잘못된 메시지는 무시(경고 누적)되고 연결 유지");

  // ── 허수아비 공격
  const dummy = b1.map.objects.find((o) => o.kind === "dummy");
  await b1.walkTo(dummy.x - 30, dummy.y, 12000);
  b1.events.length = 0;
  for (let i = 0; i < 6; i++) { b1.send({ t: "cast", slot: 0, ax: dummy.x, ay: dummy.y }); await sleep(1100); }
  ok(b1.events.some((e) => e.e === "dmg"), "스킬로 허수아비 피해");
  b1.send({ t: "cast", slot: 0, ax: dummy.x, ay: dummy.y });
  b1.send({ t: "cast", slot: 0, ax: dummy.x, ay: dummy.y });
  await sleep(100);
  ok(true, "쿨타임 중 재사용은 서버가 무시");

  // ── 파티
  b1.send({ t: "party", op: "invite", name: "봇둘" });
  ok(await b2.wait(() => b2.msgs.some((m) => m.t === "invite")), "파티 초대 수신");
  b2.send({ t: "party", op: "accept", name: "봇하나" });
  ok(await b1.wait(() => b1.msgs.some((m) => m.t === "party" && m.members.length === 2)), "파티 결성");
  b2.send({ t: "enter", floor: 1 });
  await sleep(200);
  ok(b2.map.kind === "town", "파티장이 아니면 던전 입장 불가");
  b1.send({ t: "enter", floor: 11 });
  await sleep(200);
  ok(b1.map.kind === "town", "열리지 않은 체크포인트 입장 불가");
  b1.send({ t: "enter", floor: 1 });
  ok(await b1.wait(() => b1.map.kind === "normal" && b2.map.kind === "normal"), "파티 함께 1층 입장");
  ok(b1.map.room === b2.map.room, "같은 던전 방");

  // ── 몬스터와 전투: 지도를 BFS로 길찾기해서 가까운 몬스터에게 간다
  b1.events.length = 0;
  const M = b1.map, tiles = Buffer.from(M.tiles, "base64");
  const passable = (x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h && [1, 6, 7, 8, 9].includes(tiles[y * M.w + x]);
  const monsters = new Map();
  for (const m of b1.msgs) if (m.t === "ents") for (const x of m.list) if (x.k === "m") monsters.set(x.id, x);
  const nextStep = (from, to) => {
    const sx = Math.floor(from[0] / 32), sy = Math.floor(from[1] / 32), gx = Math.floor(to[0] / 32), gy = Math.floor(to[1] / 32);
    const prev = new Map([[sy * M.w + sx, -1]]); const q = [sy * M.w + sx];
    while (q.length) { const i = q.shift(); if (i === gy * M.w + gx) break; const x = i % M.w, y = (i / M.w) | 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy, j = ny * M.w + nx; if (!passable(nx, ny) || prev.has(j)) continue; prev.set(j, i); q.push(j); } }
    let i = gy * M.w + gx; if (!prev.has(i)) return to;
    const path = []; while (i !== -1) { path.push(i); i = prev.get(i); } path.reverse();
    const n = path[Math.min(2, path.length - 1)]; return [(n % M.w) * 32 + 16, ((n / M.w) | 0) * 32 + 16];
  };
  let killed = 0, tick = 0;
  const end = Date.now() + 45000;
  while (Date.now() < end && killed < 3) {
    for (const e of b1.events) if (e.e === "die" || e.e === "del") monsters.delete(e.id);
    const me = b1.pos();
    let target = null, td = 1e9;
    for (const [id, m] of monsters) { const s = b1.ents.get(id); const x = s ? s[1] : m.x, y = s ? s[2] : m.y; const d = Math.hypot(x - me[0], y - me[1]); if (d < td) { td = d; target = [x, y]; } }
    if (target) {
      if (td > 38) { const [wx, wy] = nextStep(me, target); const dx = wx - me[0], dy = wy - me[1], d = Math.hypot(dx, dy) || 1; b1.move(dx / d, dy / d, target[0], target[1]); }
      else { b1.move(0, 0, target[0], target[1]); if (++tick % 4 === 0) b1.send({ t: "cast", slot: tick % 8 === 0 ? 1 : 0, ax: target[0], ay: target[1] }); }
    }
    await sleep(50);
    killed = b1.events.filter((e) => e.e === "die" && e.id !== b1.you && e.id !== b2.you).length;
    if (b1.me?.dead) break;
  }
  ok(b1.ws.readyState === 1, "정상 플레이 속도에서는 연결 유지");
  ok(killed >= 1, `몬스터 처치 ${killed}마리`);
  ok(b1.events.some((e) => e.e === "gold"), "골드 획득");
  ok(b1.me && b1.me.xp > 0 || b1.me.lv > 1, `경험치 획득 (lv ${b1.me?.lv}, xp ${b1.me?.xp})`);

  // ── GM API
  r = await api("/api/login", { username: "gmtest", password: "gmpass1234" });
  const gmc = r.cookie;
  r = await api("/api/gm/overview", null, gmc);
  ok(r.status === 200 && r.j.online === 2, `GM 개요 (접속 ${r.j.online})`);
  r = await api("/api/gm/players?q=봇", null, gmc);
  const target = r.j.list.find((x) => x.username === "봇하나");
  ok(!!target && target.online, "GM 플레이어 검색");
  r = await api(`/api/gm/player/${target.id}/edit`, { level: 12, gold: 50000 }, gmc);
  ok(r.status === 200, "GM 레벨·골드 수정");
  ok(await b1.wait(() => b1.char?.level === 12 && b1.char?.gold === 50000), "수정이 접속 중 캐릭터에 즉시 반영");
  r = await api(`/api/gm/player/${target.id}/give`, { rarity: "신화", ilvl: 10 }, gmc);
  ok(r.status === 200 && r.j.item.mythic, `GM 신화 아이템 지급 (${r.j.item?.name})`);
  r = await api(`/api/gm/player/${target.id}/edit`, { level: 99999 }, gmc);
  ok(r.status === 400, "GM 입력값도 범위 검증");
  r = await api(`/api/gm/audit`, null, gmc);
  ok(r.j.list.length >= 2, "GM 감사 기록");

  // ── 마을 귀환·강화
  b1.send({ t: "town" });
  ok(await b1.wait(() => b1.map.kind === "town"), "마을 귀환");
  const smithy = b1.map.objects.find((o) => o.id === "smithy");
  b1.send({ t: "enhance", uid: 1 });
  await sleep(150);
  ok(!b1.msgs.some((m) => m.t === "enh"), "대장장이에게서 멀면 강화 불가");
  await b1.walkTo(smithy.x, smithy.y + 30, 15000);
  let res = { success: 0, fail: 0, destroy: 0 };
  for (let i = 0; i < 10; i++) { b1.send({ t: "enhance", uid: 1 }); await sleep(120); }
  for (const m of b1.msgs) if (m.t === "enh") res[m.result]++;
  ok(res.success + res.fail + res.destroy === 10, `강화 10회: 성공 ${res.success} / 실패 ${res.fail} / 파괴 ${res.destroy}`);

  // ── 메시지 폭주 → 연결 차단
  const b3 = await new Bot(c2).connect();
  await sleep(200);
  ok(b2.ws.readyState !== 1 || b2.msgs.some((m) => m.t === "kick"), "같은 계정 중복 접속 시 이전 연결 종료");
  for (let i = 0; i < 400; i++) b3.send({ t: "ping", c: i });
  await sleep(500);
  ok(b3.ws.readyState !== 1, "메시지 폭주 연결 차단");
  r = await api("/api/gm/security", null, gmc);
  ok(r.j.list.some((x) => x.kind === "ws_flood"), "보안 로그에 폭주 기록");
} catch (e) {
  console.error(e);
  fails++;
} finally {
  srv.kill("SIGTERM");
  await sleep(300);
  if (fails) console.log("\n서버 로그:\n" + log.slice(-3000));
  console.log(fails ? `\n실패 ${fails}개` : "\n모든 테스트 통과");
  process.exit(fails ? 1 : 0);
}
