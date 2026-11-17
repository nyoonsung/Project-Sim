// 세션 보안 (Node·Cloudflare 공용, Web Crypto) — 로그인 자체는 구글(oauth.js)
//  - 세션: 무작위 토큰, DB에는 SHA-256 해시만 저장
import { Q } from "./db.js";
import { CONFIG } from "./config.js";

const subtle = globalThis.crypto.subtle;
export const USERNAME_RE = /^[A-Za-z0-9가-힣_]{2,12}$/;

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const enc = new TextEncoder();

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
