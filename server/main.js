// 서버 진입점: 정적 파일 + API + 웹소켓. 내 컴퓨터에서 켜서 친구들이 접속하는 자체 서버.
import http from "node:http";
import { createReadStream, statSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, normalize, extname, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { WebSocketServer } from "ws";
import { CONFIG } from "./config.js";
import { initDb, Q } from "./db.js";
import { handleApi, wsAuth } from "./api.js";
import { setAdminKey, newAdminKey } from "./admin.js";
import { attachSocket, initWorld } from "./net.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public"), SHARED = join(ROOT, "shared");
const dbPath = CONFIG.dbPath ?? join(ROOT, "data", "game.db");
mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
initDb({ exec: (s) => sqlite.exec(s), prepare: (s) => sqlite.prepare(s) });
// 관리자 키: 환경 변수 ADMIN_KEY 또는 data/admin-key.txt (없으면 새로 만듦)
const keyFile = join(dirname(dbPath), "admin-key.txt");
let adminKey = CONFIG.adminKey;
if (!adminKey) {
  if (existsSync(keyFile)) adminKey = readFileSync(keyFile, "utf8").trim();
  if (!adminKey) { adminKey = newAdminKey(); writeFileSync(keyFile, adminKey + "\n"); }
}
setAdminKey(adminKey);
const world = initWorld();

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};
export const SECURITY_HEADERS = (host) => ({
  "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws://${host} wss://${host}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  ...(CONFIG.secureCookies ? { "Strict-Transport-Security": "max-age=15552000" } : {}),
});

const isLoopback = (a) => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
const clientIp = (req) => {
  const remote = req.socket.remoteAddress ?? "?";
  // 같은 컴퓨터에서 돌아가는 터널(인터넷 공유)을 거쳐 온 요청은 원래 IP를 헤더에서 읽음
  if (CONFIG.trustProxy || isLoopback(remote)) {
    const f = String(req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (f) return f.slice(0, 64);
  }
  return remote.slice(0, 64);
};
const readJson = (req, limit = 8192) => new Promise((resolve, reject) => {
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return reject(new Error("type"));
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("size")); req.destroy(); return; } chunks.push(c); });
  req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("json")); } });
  req.on("error", reject);
});
const toReq = (req) => {
  const url = new URL(req.url, "http://x");
  return { method: req.method, path: url.pathname, url, headers: req.headers, ip: clientIp(req), readJson: () => readJson(req) };
};

function serveStatic(req, res, urlPath) {
  let base = PUBLIC, rel = urlPath;
  if (urlPath.startsWith("/shared/")) { base = SHARED; rel = urlPath.slice("/shared".length); }
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel === "/gm") rel = "/gm.html";
  let file;
  try { file = normalize(join(base, decodeURIComponent(rel))); } catch { res.writeHead(400); return res.end(); }
  let st;
  if (!file.startsWith(base + sep) || /(^|[\\/])\./.test(rel)) { res.writeHead(404); return res.end(); }
  try { st = statSync(file); } catch { res.writeHead(404); return res.end(); }
  if (!st.isFile()) { res.writeHead(404); return res.end(); }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Cache-Control": type.startsWith("font/") || file.includes(`${sep}vendor${sep}`) ? "public, max-age=86400" : "no-cache" });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS(req.headers.host ?? ""))) res.setHeader(k, v);
  const r = toReq(req);
  if (r.path.startsWith("/api/")) {
    const out = await handleApi(r);
    if (out.body == null) { res.writeHead(out.status, { "Cache-Control": "no-store", ...out.headers }); return res.end(); }
    res.writeHead(out.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...out.headers });
    return res.end(JSON.stringify(out.body));
  }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  serveStatic(req, res, r.path);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
const connPerIp = new Map();
server.on("upgrade", async (req, socket, head) => {
  const r = toReq(req);
  const reject = (code) => { socket.write(`HTTP/1.1 ${code} Rejected\r\n\r\n`); socket.destroy(); };
  if (r.path !== "/ws") return reject(404);
  const a = await wsAuth(r);
  if (!a.user) return reject(a.status);
  if ((connPerIp.get(r.ip) ?? 0) >= CONFIG.maxConnectionsPerIp) return reject(429);
  wss.handleUpgrade(req, socket, head, (ws) => {
    connPerIp.set(r.ip, (connPerIp.get(r.ip) ?? 0) + 1);
    ws.on("close", () => connPerIp.set(r.ip, Math.max(0, (connPerIp.get(r.ip) ?? 1) - 1)));
    attachSocket({
      onMessage: (fn) => ws.on("message", (d, bin) => fn(bin ? null : d.toString("utf8"), d.length)),
      onClose: (fn) => ws.on("close", fn),
      send: (t) => ws.send(t),
      close: (c, w) => ws.close(c, w),
      isOpen: () => ws.readyState === 1,
    }, a.user, r.ip);
    ws.on("error", () => {});
  });
});

setInterval(() => Q.purgeSessions.run(Date.now()), 3600e3).unref();
server.listen(CONFIG.port, CONFIG.host, () => {
  const lan = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
  const line = "─".repeat(56);
  console.log(`\n${line}\n  Abyss Run 서버 실행 중\n${line}`);
  console.log(`  이 컴퓨터에서 접속      http://localhost:${CONFIG.port}`);
  for (const ip of lan) console.log(`  같은 와이파이 친구 접속  http://${ip}:${CONFIG.port}`);
  console.log(`\n  관리자 페이지 (나만 보기, 다른 사람에게 보여 주지 마세요)`);
  console.log(`  http://localhost:${CONFIG.port}/gm#key=${adminKey}`);
  console.log(`\n  끄려면 이 창을 닫거나 Ctrl+C\n${line}\n`);
});
const shutdown = () => { console.log("저장 후 종료합니다..."); world.saveAll(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
