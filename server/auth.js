// 계정·세션 보안: scrypt 해시, 무작위 세션 토큰(해시만 저장), 로그인 시도 제한
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { Q, secLog } from "./db.js";
import { CONFIG } from "./config.js";

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const USERNAME_RE = /^[A-Za-z0-9가-힣_]{2,12}$/;

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
export function verifyPassword(pw, stored) {
  const [alg, s, k] = String(stored).split("$");
  if (alg !== "scrypt" || !s || !k) return false;
  const key = scryptSync(pw, Buffer.from(s, "base64"), 32, SCRYPT);
  const want = Buffer.from(k, "base64");
  return key.length === want.length && timingSafeEqual(key, want);
}
// 존재하지 않는 계정도 같은 시간이 걸리도록 (계정 존재 여부 노출 방지)
const DUMMY = hashPassword(randomBytes(12).toString("hex"));

export function validatePassword(pw) {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > 72) return "비밀번호는 8~72자여야 해요.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "비밀번호에 영문과 숫자를 모두 넣어 주세요.";
  return null;
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function createSession(userId, ip) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  Q.createSession.run(sha256(token), userId, now, now + CONFIG.sessionDays * 864e5, ip ?? null);
  return token;
}
export function sessionUser(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const s = Q.sessionByHash.get(sha256(token), Date.now());
  if (!s) return null;
  const u = Q.userById.get(s.user_id);
  if (!u) return null;
  return u;
}
export function destroySession(token) {
  if (typeof token === "string") Q.deleteSession.run(sha256(token));
}

// ── 로그인 시도 제한: IP당·계정당 (메모리)
const attempts = new Map(); // key -> { n, until, first }
function hit(key, limit, windowMs, lockMs) {
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || now - a.first > windowMs) a = { n: 0, first: now, until: 0 };
  a.n++;
  if (a.n >= limit) a.until = now + lockMs;
  attempts.set(key, a);
}
function locked(key) {
  const a = attempts.get(key);
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 1000) : 0;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of attempts) if (now - a.first > 3600e3 && a.until < now) attempts.delete(k);
}, 600e3).unref();

export function login(username, password, ip) {
  if (typeof username !== "string" || typeof password !== "string" || password.length > 200) return { error: "잘못된 요청이에요." };
  const lockIp = locked("ip:" + ip), lockUser = locked("u:" + username.toLowerCase());
  if (lockIp || lockUser) return { error: `로그인 시도가 너무 많아요. ${Math.max(lockIp, lockUser)}초 뒤에 다시 시도해 주세요.`, status: 429 };
  const u = Q.userByName.get(username);
  const ok = verifyPassword(password, u ? u.pass_hash : DUMMY) && !!u;
  if (!ok) {
    hit("ip:" + ip, 20, 600e3, 600e3);
    hit("u:" + username.toLowerCase(), 8, 600e3, 300e3);
    secLog("login_fail", { username: username.slice(0, 24), ip, userId: u?.id ?? null });
    return { error: "아이디 또는 비밀번호가 맞지 않아요." };
  }
  if (u.banned_until > Date.now()) {
    secLog("login_banned", { userId: u.id, username: u.username, ip });
    return { error: `이용이 제한된 계정이에요. (${new Date(u.banned_until).toLocaleString("ko-KR")}까지) 사유: ${u.ban_reason ?? "-"}`, status: 403 };
  }
  attempts.delete("u:" + username.toLowerCase());
  Q.touchLogin.run(Date.now(), ip ?? null, u.id);
  return { user: u, token: createSession(u.id, ip) };
}

export function register(username, password, ip) {
  if (!CONFIG.registrationOpen) return { error: "지금은 가입을 받지 않아요.", status: 403 };
  if (typeof username !== "string" || !USERNAME_RE.test(username)) return { error: "아이디는 2~12자, 한글·영문·숫자·_ 만 쓸 수 있어요." };
  const pwErr = validatePassword(password);
  if (pwErr) return { error: pwErr };
  if (locked("reg:" + ip)) return { error: "가입 시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.", status: 429 };
  hit("reg:" + ip, 5, 3600e3, 3600e3);
  if (Q.userByName.get(username)) return { error: "이미 있는 아이디예요." };
  const info = Q.createUser.run(username, hashPassword(password), "player", Date.now());
  secLog("register", { userId: Number(info.lastInsertRowid), username, ip });
  const u = Q.userById.get(Number(info.lastInsertRowid));
  return { user: u, token: createSession(u.id, ip) };
}

/** 쿠키 파싱 */
export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k && !(k in out)) out[k] = decodeURIComponent(v);
  }
  return out;
}
export function sessionCookie(token, maxAgeSec) {
  return [`sid=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAgeSec}`, CONFIG.secureCookies ? "Secure" : null].filter(Boolean).join("; ");
}
