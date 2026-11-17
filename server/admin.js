// 관리자(서버 주인) 인증: GM 계정 대신, 서버를 켠 컴퓨터에만 보이는 "관리자 키"로 관리 페이지에 들어간다.
//  - 키는 처음 실행할 때 무작위로 만들어 data/admin-key.txt 에 저장하고 서버 창에 관리자 주소로 보여 준다.
//  - 키로 로그인하면 관리자 쿠키(무작위 토큰, 메모리에만 저장)를 받는다. 키 시도 횟수 제한.
import { parseCookies } from "./auth.js";
import { secLog } from "./db.js";
import { CONFIG } from "./config.js";

let adminKey = null;
const sessions = new Map(); // token → expires
const tries = new Map(); // ip → { n, until }
const rand = (n) => btoa(String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function setAdminKey(k) { adminKey = String(k); }
export function newAdminKey() { return rand(18); }

function same(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

export function isAdmin(req) {
  const t = parseCookies(req.headers.cookie).adm;
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}

const cookie = (t, age) => [`adm=${t}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${age}`, CONFIG.secureCookies ? "Secure" : null].filter(Boolean).join("; ");

/** 관리자 키로 로그인 */
export function adminLogin(req, key) {
  const ip = req.ip ?? "?";
  const t = tries.get(ip);
  if (t && t.until > Date.now()) return { status: 429, body: { error: `시도가 너무 많아요. ${Math.ceil((t.until - Date.now()) / 1000)}초 뒤에 다시 해 주세요.` }, headers: {} };
  if (!adminKey || typeof key !== "string" || !same(key.trim(), adminKey)) {
    const c = t && Date.now() - (t.first ?? 0) < 600e3 ? t : { n: 0, first: Date.now(), until: 0 };
    c.n++;
    if (c.n >= 5) c.until = Date.now() + 600e3;
    tries.set(ip, c);
    secLog("admin_key_fail", { ip });
    return { status: 401, body: { error: "관리자 키가 맞지 않아요." }, headers: {} };
  }
  tries.delete(ip);
  const token = rand(32);
  sessions.set(token, Date.now() + 12 * 3600e3);
  secLog("admin_login", { ip });
  return { status: 200, body: { ok: true }, headers: { "Set-Cookie": cookie(token, 12 * 3600) } };
}
export function adminLogout(req) {
  const t = parseCookies(req.headers.cookie).adm;
  if (t) sessions.delete(t);
  return { status: 200, body: { ok: true }, headers: { "Set-Cookie": cookie("", 0) } };
}
