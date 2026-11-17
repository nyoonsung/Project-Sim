// 관리자(서버 주인) 인증. GM 계정은 없고, 관리자 페이지(/gm)에 따로 로그인한다.
//  - 관리자 비밀번호: 처음 /gm 에 들어온 사람이 정함(DB에 해시로 저장). 그 뒤로는 그 비밀번호로만 들어옴.
//  - 관리자 키(선택): 환경 변수 ADMIN_KEY 또는 내 컴퓨터 서버의 data/admin-key.txt. 비밀번호를 잊었을 때 이 키로 들어와서 바꿈.
//  - 로그인하면 관리자 쿠키(무작위 토큰, 메모리 저장). 5번 틀리면 10분 잠금.
import { parseCookies, hashPassword, verifyPassword, validatePassword } from "./auth.js";
import { Q, secLog } from "./db.js";
import { CONFIG } from "./config.js";

let adminKey = null;
const sessions = new Map(); // token → expires
const tries = new Map(); // ip → { n, first, until }
const rand = (n) => btoa(String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function setAdminKey(k) { adminKey = k ? String(k) : null; }
export function newAdminKey() { return rand(18); }
const passHash = () => Q.metaGet.get("admin_pass")?.v ?? null;
/** 아직 관리자 비밀번호도, 관리자 키도 없음 → 처음 들어온 사람이 비밀번호를 정할 수 있음 */
export const needsSetup = () => !adminKey && !passHash();

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
const res = (status, body, headers = {}) => ({ status, body, headers });
function grant(ip, why) {
  const token = rand(32);
  sessions.set(token, Date.now() + 12 * 3600e3);
  if (sessions.size > 200) for (const [k, v] of sessions) if (v < Date.now()) sessions.delete(k);
  secLog("admin_login", { ip, detail: { why } });
  return res(200, { ok: true }, { "Set-Cookie": cookie(token, 12 * 3600) });
}
function lockedFor(ip) {
  const t = tries.get(ip);
  return t && t.until > Date.now() ? Math.ceil((t.until - Date.now()) / 1000) : 0;
}
function fail(ip) {
  const t = tries.get(ip);
  const c = t && Date.now() - t.first < 600e3 ? t : { n: 0, first: Date.now(), until: 0 };
  c.n++;
  if (c.n >= 5) c.until = Date.now() + 600e3;
  tries.set(ip, c);
  secLog("admin_key_fail", { ip });
}

export function adminStatus(req) {
  return res(200, { admin: isAdmin(req), setup: needsSetup() });
}

/** 처음 한 번: 관리자 비밀번호 정하기 */
export async function adminSetup(req, password) {
  if (!needsSetup()) return res(403, { error: "관리자 비밀번호가 이미 정해져 있어요." });
  const err = validatePassword(password);
  if (err) return res(400, { error: err });
  if (!needsSetup()) return res(403, { error: "관리자 비밀번호가 이미 정해져 있어요." });
  Q.metaSet.run("admin_pass", await hashPassword(password));
  secLog("admin_setup", { ip: req.ip });
  return grant(req.ip, "setup");
}

/** 관리자 비밀번호 또는 관리자 키로 로그인 */
export async function adminLogin(req, secret) {
  const ip = req.ip ?? "?";
  const wait = lockedFor(ip);
  if (wait) return res(429, { error: `시도가 너무 많아요. ${wait}초 뒤에 다시 해 주세요.` });
  if (typeof secret !== "string" || !secret || secret.length > 200) { fail(ip); return res(401, { error: "관리자 비밀번호가 맞지 않아요." }); }
  const s = secret.trim();
  if (adminKey && same(s, adminKey)) { tries.delete(ip); return grant(ip, "key"); }
  const h = passHash();
  if (h && (await verifyPassword(s, h))) { tries.delete(ip); return grant(ip, "password"); }
  fail(ip);
  return res(401, { error: "관리자 비밀번호가 맞지 않아요." });
}

/** 관리자 비밀번호 바꾸기 (관리자 로그인 상태에서) */
export async function adminChangePassword(req, next) {
  if (!isAdmin(req)) return res(403, { error: "관리자 로그인이 필요해요." });
  const err = validatePassword(next);
  if (err) return res(400, { error: err });
  Q.metaSet.run("admin_pass", await hashPassword(next));
  sessions.clear();
  secLog("admin_password", { ip: req.ip });
  return grant(req.ip, "changed");
}

export function adminLogout(req) {
  const t = parseCookies(req.headers.cookie).adm;
  if (t) sessions.delete(t);
  return res(200, { ok: true }, { "Set-Cookie": cookie("", 0) });
}
