// 서버 진입점: 정적 파일, REST API(로그인·GM), 웹소켓(게임)
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, normalize, extname, sep } from "node:path";
import { WebSocketServer } from "ws";
import { CONFIG } from "./config.js";
import { Q, secLog } from "./db.js";
import { login, register, parseCookies, sessionCookie, sessionUser, destroySession, hashPassword, validatePassword, USERNAME_RE } from "./auth.js";
import { handleGm } from "./gm.js";
import { attachSocket, world } from "./net.js";

const PUBLIC = join(CONFIG.root, "public");
const SHARED = join(CONFIG.root, "shared");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

function securityHeaders(res, req) {
  const host = req.headers.host ?? "";
  res.setHeader("Content-Security-Policy",
    `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; ` +
    `connect-src 'self' ws://${host} wss://${host}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (CONFIG.secureCookies) res.setHeader("Strict-Transport-Security", "max-age=15552000");
}

export function clientIp(req) {
  if (CONFIG.trustProxy) {
    const f = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (f) return f.slice(0, 64);
  }
  return (req.socket.remoteAddress ?? "?").slice(0, 64);
}

/** 같은 출처 요청인지 (CSRF·웹소켓 하이재킹 방지) */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (CONFIG.allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function send(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(body);
}

function readJson(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return reject(new Error("type"));
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("size")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("json")); }
    });
    req.on("error", reject);
  });
}

export function currentUser(req) {
  const sid = parseCookies(req.headers.cookie).sid;
  const u = sessionUser(sid);
  if (u && u.banned_until > Date.now()) return null;
  return u;
}

function serveStatic(req, res, urlPath) {
  let base = PUBLIC, rel = urlPath;
  if (urlPath.startsWith("/shared/")) { base = SHARED; rel = urlPath.slice("/shared".length); }
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel === "/gm") rel = "/gm.html";
  let file;
  try { file = normalize(join(base, decodeURIComponent(rel))); } catch { return send(res, 400, { error: "bad path" }); }
  if (!file.startsWith(base + sep) || /(^|[\\/])\./.test(rel)) return send(res, 404, { error: "not found" });
  let st;
  try { st = statSync(file); } catch { return send(res, 404, { error: "not found" }); }
  if (!st.isFile()) return send(res, 404, { error: "not found" });
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type, "Content-Length": st.size,
    "Cache-Control": type.startsWith("font/") || file.includes(`${sep}vendor${sep}`) ? "public, max-age=86400" : "no-cache",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res, req);
  const url = new URL(req.url, "http://x");
  const path = url.pathname;
  const ip = clientIp(req);
  try {
    if (path.startsWith("/api/")) {
      if (req.method !== "GET" && !sameOrigin(req)) {
        secLog("csrf_block", { ip, detail: { path, origin: req.headers.origin ?? null } });
        return send(res, 403, { error: "허용되지 않은 출처예요." });
      }
      if (path === "/api/register" && req.method === "POST") {
        const b = await readJson(req);
        const r = register(b.username, b.password, ip);
        if (r.error) return send(res, r.status ?? 400, { error: r.error });
        return send(res, 200, { ok: true, user: { name: r.user.username, role: r.user.role } }, { "Set-Cookie": sessionCookie(r.token, CONFIG.sessionDays * 86400) });
      }
      if (path === "/api/login" && req.method === "POST") {
        const b = await readJson(req);
        const r = login(b.username, b.password, ip);
        if (r.error) return send(res, r.status ?? 401, { error: r.error });
        return send(res, 200, { ok: true, user: { name: r.user.username, role: r.user.role } }, { "Set-Cookie": sessionCookie(r.token, CONFIG.sessionDays * 86400) });
      }
      if (path === "/api/logout" && req.method === "POST") {
        destroySession(parseCookies(req.headers.cookie).sid);
        return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
      }
      if (path === "/api/me" && req.method === "GET") {
        const u = currentUser(req);
        if (!u) return send(res, 401, { error: "로그인이 필요해요." });
        return send(res, 200, { name: u.username, role: u.role });
      }
      if (path === "/api/password" && req.method === "POST") {
        const u = currentUser(req);
        if (!u) return send(res, 401, { error: "로그인이 필요해요." });
        const b = await readJson(req);
        const r = login(u.username, b.current, ip);
        if (r.error) return send(res, 400, { error: "현재 비밀번호가 맞지 않아요." });
        destroySession(r.token);
        const err = validatePassword(b.next);
        if (err) return send(res, 400, { error: err });
        Q.setPass.run(hashPassword(b.next), u.id);
        Q.deleteUserSessions.run(u.id);
        secLog("password_change", { userId: u.id, username: u.username, ip });
        return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
      }
      if (path === "/api/ranking" && req.method === "GET") return send(res, 200, { list: Q.ranking.all() });
      if (path.startsWith("/api/gm/")) return await handleGm(req, res, path, { readJson, send, currentUser, ip, url });
      return send(res, 404, { error: "없는 API예요." });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method" });
    return serveStatic(req, res, path);
  } catch (e) {
    if (["type", "size", "json"].includes(e.message)) return send(res, 400, { error: "잘못된 요청 형식이에요." });
    console.error(e);
    return send(res, 500, { error: "서버 오류" });
  }
});

// ── 웹소켓
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
const connPerIp = new Map();
server.on("upgrade", (req, socket, head) => {
  const ip = clientIp(req);
  const reject = (code, why) => { secLog("ws_reject", { ip, detail: { why } }); socket.write(`HTTP/1.1 ${code} ${why}\r\n\r\n`); socket.destroy(); };
  if (new URL(req.url, "http://x").pathname !== "/ws") return reject(404, "Not Found");
  if (!sameOrigin(req)) return reject(403, "Forbidden");
  const u = currentUser(req);
  if (!u) return reject(401, "Unauthorized");
  if ((connPerIp.get(ip) ?? 0) >= CONFIG.maxConnectionsPerIp) return reject(429, "Too Many");
  wss.handleUpgrade(req, socket, head, (ws) => {
    connPerIp.set(ip, (connPerIp.get(ip) ?? 0) + 1);
    ws.on("close", () => connPerIp.set(ip, Math.max(0, (connPerIp.get(ip) ?? 1) - 1)));
    attachSocket(ws, u, ip);
  });
});

// ── 첫 실행 시 GM 계정 (환경 변수로만)
if (CONFIG.initialGmUser && CONFIG.initialGmPass && USERNAME_RE.test(CONFIG.initialGmUser)) {
  const ex = Q.userByName.get(CONFIG.initialGmUser);
  if (!ex) {
    if (validatePassword(CONFIG.initialGmPass)) console.warn("INITIAL_GM_PASS가 약해서 GM 계정을 만들지 않았어요 (8자 이상, 영문+숫자).");
    else {
      Q.createUser.run(CONFIG.initialGmUser, hashPassword(CONFIG.initialGmPass), "gm", Date.now());
      console.log(`GM 계정 생성: ${CONFIG.initialGmUser}`);
    }
  } else if (ex.role !== "gm") Q.setRole.run("gm", ex.id);
}
setInterval(() => Q.purgeSessions.run(Date.now()), 3600e3).unref();

server.listen(CONFIG.port, CONFIG.host, () => console.log(`Project-Sim 서버 실행 중: http://localhost:${CONFIG.port}`));

const shutdown = () => {
  console.log("저장 후 종료합니다...");
  world.saveAll();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
