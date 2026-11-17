// HTTP API (플랫폼 공용). Node/Cloudflare 진입점이 요청을 { method, path, url, headers(소문자 키), ip, readJson } 로 바꿔 넘긴다.
import { CONFIG } from "./config.js";
import { Q, secLog } from "./db.js";
import { parseCookies, sessionCookie, sessionUser, destroySession, createSession, USERNAME_RE } from "./auth.js";
import { startGoogle, googleCallback, finishSignup, googleEnabled } from "./oauth.js";
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
    // 구글 로그인
    if (path === "/api/auth/config" && method === "GET") return reply(200, { google: googleEnabled(), dev: CONFIG.devLogin });
    if (path === "/api/auth/google" && method === "GET") return await startGoogle(req);
    if (path === "/api/auth/google/callback" && method === "GET") return await googleCallback(req);
    if (path === "/api/auth/signup" && method === "POST") return await finishSignup(req);
    // 테스트 전용 (DEV_LOGIN=1일 때만)
    if (path === "/api/dev-login" && method === "POST" && CONFIG.devLogin) {
      const b = await req.readJson();
      const name = String(b.username ?? "");
      if (!USERNAME_RE.test(name)) return reply(400, { error: "닉네임 형식" });
      let u = Q.userByName.get(name);
      if (!u) { Q.createGoogleUser.run(name, "dev:" + name, null, b.gm ? "gm" : "player", Date.now()); u = Q.userByName.get(name); }
      if (u.banned_until > Date.now()) return reply(403, { error: "이용이 제한된 계정이에요." });
      return reply(200, { ok: true, user: { name: u.username, role: u.role } }, cookie(await createSession(u.id, ip)));
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

/** INITIAL_GM_EMAIL 과 같은 이메일로 이미 가입한 계정이 있으면 GM으로 */
export async function ensureInitialGm() {
  if (!CONFIG.initialGmEmail) return;
  try {
    const u = Q.userByEmail.get(CONFIG.initialGmEmail);
    if (u && u.role !== "gm") { Q.setRole.run("gm", u.id); console.log("GM 지정:", u.username); }
  } catch (e) { console.error("GM 지정 실패", e); }
}
