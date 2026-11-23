// HTTP API (플랫폼 공용). Node/Cloudflare 진입점이 요청을 { method, path, url, headers(소문자 키), ip, readJson } 로 바꿔 넘긴다.
import { CONFIG } from "./config.js";
import { Q, secLog } from "./db.js";
import { login, register, parseCookies, sessionCookie, sessionUser, destroySession, hashPassword, validatePassword } from "./auth.js";
import { isAdmin, adminLogin, adminLogout, adminStatus, adminSetup, adminChangePassword } from "./admin.js";
import { handleGm } from "./gm.js";
import { initWorld } from "./net.js";

export const reply = (status, body, headers = {}) => ({ status, body, headers });

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (CONFIG.allowedOrigins.includes(origin)) return true;
  // 터널(인터넷 공유)을 거치면 Host가 바뀔 수 있어 X-Forwarded-Host도 확인
  // (브라우저는 다른 사이트에서 이 헤더를 마음대로 붙일 수 없음)
  try { const h = new URL(origin).host; return h === req.headers.host || h === req.headers["x-forwarded-host"]; } catch { return false; }
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
      const b = await req.readJson();
      const r = await register(b.username, b.password, ip);
      if (r.error) return reply(r.status ?? 400, { error: r.error });
      return reply(200, { ok: true, user: { name: r.user.username } }, cookie(r.token));
    }
    if (path === "/api/login" && method === "POST") {
      const b = await req.readJson();
      const r = await login(b.username, b.password, ip);
      if (r.error) return reply(r.status ?? 401, { error: r.error });
      return reply(200, { ok: true, user: { name: r.user.username } }, cookie(r.token));
    }
    if (path === "/api/logout" && method === "POST") {
      await destroySession(parseCookies(req.headers.cookie).sid);
      return reply(200, { ok: true }, cookie(""));
    }
    if (path === "/api/me" && method === "GET") {
      const u = await currentUser(req);
      if (!u) return reply(401, { error: "로그인이 필요해요." });
      return reply(200, { name: u.username });
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
      return reply(200, { ok: true }, cookie(""));
    }
    // 관리자 (서버 주인)
    if (path === "/api/admin/setup" && method === "POST") { const b = await req.readJson(); return await adminSetup(req, b.password); }
    if (path === "/api/admin/login" && method === "POST") { const b = await req.readJson(); return await adminLogin(req, b.key); }
    if (path === "/api/admin/password" && method === "POST") { const b = await req.readJson(); return await adminChangePassword(req, b.next); }
    if (path === "/api/admin/logout" && method === "POST") return adminLogout(req);
    if (path === "/api/admin/me" && method === "GET") return adminStatus(req);
    if (path === "/api/ranking" && method === "GET") return reply(200, { list: Q.ranking.all() });
    // 배포 전에 확인용: 지금 접속자 수와 던전 안에 있는 사람 수 (이름 등 개인 정보 없음)
    if (path === "/api/status" && method === "GET") {
      const w = initWorld(); let online = 0, dungeon = 0;
      for (const s of w.sessions.values()) { online++; if (s.unit.room && !w.isTown(s.unit.room)) dungeon++; }
      return reply(200, { online, dungeon });
    }
    if (path.startsWith("/api/gm/")) return await handleGm(req, null, path, { readJson: () => req.readJson(), send: (_res, s, b, h) => reply(s, b, h), isAdmin, ip, url: req.url });
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

