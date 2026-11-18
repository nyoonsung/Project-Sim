// 계정·세션 보안 (Web Crypto)
//  - 비밀번호: PBKDF2-SHA256 10만 회(Cloudflare 상한) + 무작위 소금
//  - 세션: 무작위 토큰, DB에는 SHA-256 해시만 저장
//  - 로그인·가입 시도 제한
import { Q, secLog } from "./db.js";
import { CONFIG } from "./config.js";

const subtle = globalThis.crypto.subtle;
const ITER = 100000;
export const USERNAME_RE = /^[A-Za-z0-9가-힣_]{2,12}$/;

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const enc = new TextEncoder();

async function pbkdf2(pw, salt, iter) {
  const key = await subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export async function hashPassword(pw) {
  const salt = rand(16);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(pw, salt, ITER))}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, it, s, k] = String(stored).split("$");
  if (alg !== "pbkdf2" || !s || !k) return false;
  return same(await pbkdf2(pw, unb64(s), Math.min(Number(it) || ITER, 1000000)), unb64(k));
}
let DUMMY = null; // 없는 계정도 같은 시간이 걸리도록

/** 관리자 비밀번호: 8자 이상 (관리자 페이지 보안) */
export function validatePassword(pw) {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > 72) return "비밀번호는 8~72자여야 해요.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "비밀번호에 영문과 숫자를 모두 넣어 주세요.";
  return null;
}
/** 플레이어 비밀번호: 길이 제한 없음(최대 72자), 영문+숫자 */
export function validatePlayerPassword(pw) {
  if (typeof pw !== "string" || pw.length < 1 || pw.length > 72) return "비밀번호를 넣어 주세요. (최대 72자)";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "비밀번호에 영문과 숫자를 모두 넣어 주세요.";
  return null;
}

async function sha256(s) {
  return [...new Uint8Array(await subtle.digest("SHA-256", enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const tokenOf = () => b64(rand(32)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function createSession(userId, ip) {
  const token = tokenOf();
  const now = Date.now();
  Q.createSession.run(await sha256(token), userId, now, now + CONFIG.sessionDays * 864e5, ip ?? null);
  return token;
}
export async function sessionUser(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const s = Q.sessionByHash.get(await sha256(token), Date.now());
  if (!s) return null;
  return Q.userById.get(s.user_id) ?? null;
}
export async function destroySession(token) {
  if (typeof token === "string" && token) Q.deleteSession.run(await sha256(token));
}

// ── 시도 제한 (메모리)
const attempts = new Map();
function hit(key, limit, windowMs, lockMs) {
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || now - a.first > windowMs) a = { n: 0, first: now, until: 0 };
  a.n++;
  if (a.n >= limit) a.until = now + lockMs;
  attempts.set(key, a);
  if (attempts.size > 5000) for (const [k, v] of attempts) if (now - v.first > 3600e3 && v.until < now) attempts.delete(k);
}
function locked(key) {
  const a = attempts.get(key);
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 1000) : 0;
}

export async function login(username, password, ip) {
  if (typeof username !== "string" || typeof password !== "string" || password.length > 200 || username.length > 24) return { error: "잘못된 요청이에요." };
  const lockIp = locked("ip:" + ip), lockUser = locked("u:" + username.toLowerCase());
  if (lockIp || lockUser) return { error: `로그인 시도가 너무 많아요. ${Math.max(lockIp, lockUser)}초 뒤에 다시 시도해 주세요.`, status: 429 };
  const u = Q.userByName.get(username);
  DUMMY ??= await hashPassword("dummy-password-0");
  const ok = (await verifyPassword(password, u ? u.pass_hash : DUMMY)) && !!u;
  if (!ok) {
    hit("ip:" + ip, 60, 600e3, 300e3);
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
  return { user: u, token: await createSession(u.id, ip) };
}

export async function register(username, password, ip) {
  if (!CONFIG.registrationOpen) return { error: "지금은 가입을 받지 않아요.", status: 403 };
  if (typeof username !== "string" || !USERNAME_RE.test(username)) return { error: "아이디는 2~12자, 한글·영문·숫자·_ 만 쓸 수 있어요." };
  const pwErr = validatePlayerPassword(password);
  if (pwErr) return { error: pwErr };
  if (locked("reg:" + ip)) return { error: "가입 시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.", status: 429 };
  hit("reg:" + ip, 300, 3600e3, 3600e3); // 한 사람이 계정 여러 개 + 학교처럼 한 IP에서 여러 명이 가입해도 되도록 넉넉하게
  const old = Q.userByName.get(username);
  let id;
  if (old && !old.pass_hash) {
    // 예전(구글 로그인) 계정은 비밀번호가 없음 → 처음 이 아이디로 가입하는 사람이 비밀번호를 정함
    Q.setPass.run(await hashPassword(password), old.id);
    id = old.id;
  } else {
    if (old) return { error: "이미 있는 아이디예요." };
    id = Q.createUser.run(username, await hashPassword(password), "player", Date.now()).lastInsertRowid;
  }
  secLog("register", { userId: Number(id), username, ip });
  const u = Q.userById.get(Number(id));
  return { user: u, token: await createSession(u.id, ip) };
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k && !(k in out)) { try { out[k] = decodeURIComponent(v); } catch { out[k] = v; } }
  }
  return out;
}
export function sessionCookie(token, maxAgeSec) {
  return [`sid=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAgeSec}`, CONFIG.secureCookies ? "Secure" : null].filter(Boolean).join("; ");
}
