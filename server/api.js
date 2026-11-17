// HTTP API (플랫폼 공용). Node/Cloudflare 진입점이 요청을 { method, path, url, headers(소문자 키), ip, readJson } 로 바꿔 넘긴다.
import { CONFIG } from "./config.js";
import { Q, secLog } from "./db.js";
import { login, register, parseCookies, sessionCookie, sessionUser, destroySession, hashPassword, validatePassword, USERNAME_RE } from "./auth.js";
import { handleGm } from "./gm.js";

export const reply = (status, body, headers = {}) => ({ status, body, headers });

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (CONFIG.allowedOrigins.includes(origin)) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export async function currentUser(req) {
  const u = await sessionUser(parseCookies(req.headers.cookie).sid);
  if (u && u.banned_until > Date.now()) return null;
  return u;
}

export async function handleApi(req) {
  const { path, method, ip } = req;
  try {
    if (method !== "GET" && !sameOrigin(req)) {
      secLog("csrf_block", { ip, detail: { path, origin: req.headers.origin ?? null } });
      return reply(403, { error: "허용되지 않은 출처예요." });
    }
    const cookie = (t) => ({ "Set-Cookie": sessionCookie(t, t ? CONFIG.sessionDays * 86400 : 0) });
    if (path === "/api/register" && method === "POST") {
      await ensureInitialGm();
      const b = await req.readJson();
      const r = await register(b.username, b.password, ip);
      if (r.error) return reply(r.status ?? 400, { error: r.error });
      return reply(200, { ok: true, user: { name: r.user.username, role: r.user.role } }, cookie(r.token));
    }
    if (path === "/api/login" && method === "POST") {
      await ensureInitialGm(); // 비밀값을 나중에 바꿔도 다음 로그인 때 바로 반영
      const b = await req.readJson();
      await syncInitialGm(b.username, b.password);
      const r = await login(b.username, b.password, ip);
      if (r.error) return reply(r.status ?? 401, { error: r.error });
      return reply(200, { ok: true, user: { name: r.user.username, role: r.user.role } }, cookie(r.token));
    }
    if (path === "/api/logout" && method === "POST") {
      await destroySession(parseCookies(req.headers.cookie).sid);
      return reply(200, { ok: true }, cookie(""));
    }
    if (path === "/api/me" && method === "GET") {
      const u = await currentUser(req);
      if (!u) return reply(401, { error: "로그인이 필요해요." });
      return reply(200, { name: u.username, role: u.role });
    }
    if (path === "/api/password" && method === "POST") {
      const u = await currentUser(req);
      if (!u) return reply(401, { error: "로그인이 필요해요." });
      const b = await req.readJson();
      const r = await login(u.username, b.current, ip);
      if (r.error) return reply(400, { error: "현재 비밀번호가 맞지 않아요." });
      await destroySession(r.token);
      const err = validatePassword(b.next);
      if (err) return reply(400, { error: err });
      Q.setPass.run(await hashPassword(b.next), u.id);
      Q.deleteUserSessions.run(u.id);
      secLog("password_change", { userId: u.id, username: u.username, ip });
      return reply(200, { ok: true }, cookie(""));
    }
    if (path === "/api/ranking" && method === "GET") return reply(200, { list: Q.ranking.all() });
    if (path.startsWith("/api/gm/")) return await handleGm(req, null, path, { readJson: () => req.readJson(), send: (_res, s, b, h) => reply(s, b, h), currentUser, ip, url: req.url });
    return reply(404, { error: "없는 API예요." });
  } catch (e) {
    if (["type", "size", "json"].includes(e?.message)) return reply(400, { error: "잘못된 요청 형식이에요." });
    console.error("API 오류", path, e?.stack ?? e);
    return reply(500, { error: "서버 오류" });
  }
}

/** 웹소켓 접속 허가: 같은 출처 + 로그인 세션 */
export async function wsAuth(req) {
  if (!sameOrigin(req)) { secLog("ws_reject", { ip: req.ip, detail: { why: "origin" } }); return { status: 403 }; }
  const u = await currentUser(req);
  if (!u) { secLog("ws_reject", { ip: req.ip, detail: { why: "auth" } }); return { status: 401 }; }
  return { user: u };
}

/**
 * 서버 비밀값(INITIAL_GM_USER/PASS)과 정확히 같은 아이디·비밀번호로 로그인하면,
 * 그 계정이 예전에 다른 비밀번호로 가입돼 있었어도 GM으로 만들고 비밀번호를 비밀값에 맞춘다.
 * (비밀값을 아는 사람 = 서버 주인)
 */
async function syncInitialGm(username, password) {
  const name = CONFIG.initialGmUser?.trim(), pass = CONFIG.initialGmPass;
  if (!name || !pass || typeof username !== "string" || typeof password !== "string") return;
  if (username.trim().normalize("NFC").toLowerCase() !== name.normalize("NFC").toLowerCase()) return;
  const a = new TextEncoder().encode(password), b = new TextEncoder().encode(pass);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (d !== 0) return;
  const u = Q.userByName.get(name);
  if (!u) return;
  if (u.role !== "gm") Q.setRole.run("gm", u.id);
  Q.setPass.run(await hashPassword(pass), u.id);
  console.log("GM 계정을 서버 비밀값에 맞췄어요:", name);
}

/** 첫 실행 시 환경 변수로 GM 계정 */
export async function ensureInitialGm() {
  try { await createInitialGm(); } catch (e) { console.error("GM 계정 생성 실패", e); }
}
async function createInitialGm() {
  const name = CONFIG.initialGmUser?.trim(), pass = CONFIG.initialGmPass;
  if (!name || !pass) { if (!createInitialGm.warned) { createInitialGm.warned = true; console.warn(`INITIAL_GM 비밀값 확인: 아이디 ${name ? "있음" : "없음"}, 비밀번호 ${pass ? "있음" : "없음"}`); } return; }
  if (!USERNAME_RE.test(name)) return console.warn(`INITIAL_GM_USER "${name}"는 쓸 수 없는 아이디예요 (2~12자, 한글·영문·숫자·_, 띄어쓰기 불가).`);
  const ex = Q.userByName.get(name);
  if (!ex) {
    if (validatePassword(pass)) return console.warn("INITIAL_GM_PASS가 약해서 GM 계정을 만들지 않았어요 (8~72자, 영문과 숫자 모두 포함).");
    Q.createUser.run(name, await hashPassword(pass), "gm", Date.now());
    console.log(`GM 계정 생성: ${name}`);
  } else if (ex.role !== "gm") Q.setRole.run("gm", ex.id);
}
