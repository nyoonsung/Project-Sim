// 구글 로그인 (OAuth 2.0 인가 코드 + PKCE + state)
//  - 비밀번호를 저장하지 않는다. 구글 계정 고유번호(sub)로 계정을 찾는다.
//  - 처음 로그인하면 게임 닉네임을 정한다.
//  - INITIAL_GM_EMAIL 과 같은 이메일의 구글 계정이 GM.
import { CONFIG } from "./config.js";
import { Q, secLog } from "./db.js";
import { createSession, sessionCookie, parseCookies, USERNAME_RE } from "./auth.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const pending = new Map(); // state → { verifier, at }
const signups = new Map(); // ticket → { sub, email, at }
const TTL = 10 * 60e3;

const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const b64url = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sweep = (m) => { const now = Date.now(); for (const [k, v] of m) if (now - v.at > TTL) m.delete(k); };
const tempCookie = (name, value, maxAge) => [`${name}=${value}`, "Path=/api/auth", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`, CONFIG.secureCookies ? "Secure" : null].filter(Boolean).join("; ");

export const googleEnabled = () => !!(CONFIG.googleClientId && CONFIG.googleClientSecret);
function redirectUri(req) {
  if (CONFIG.publicUrl) return CONFIG.publicUrl.replace(/\/$/, "") + "/api/auth/google/callback";
  const proto = req.headers["x-forwarded-proto"] ?? (CONFIG.secureCookies ? "https" : "http");
  return `${proto}://${req.headers.host}/api/auth/google/callback`;
}
const redirect = (to, cookies = []) => ({ status: 302, body: null, headers: { Location: to, "Set-Cookie": cookies } });

/** 로그인 시작: 구글로 보냄 */
export async function startGoogle(req) {
  if (!googleEnabled()) return redirect("/?error=google_off");
  sweep(pending);
  const state = b64url(rand(24)), verifier = b64url(rand(48));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  pending.set(state, { verifier, at: Date.now() });
  const q = new URLSearchParams({
    client_id: CONFIG.googleClientId, redirect_uri: redirectUri(req), response_type: "code", scope: "openid email profile",
    state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return redirect(`${AUTH_URL}?${q}`, [tempCookie("oauth_state", state, 600)]);
}

function decodeJwt(t) {
  const p = String(t).split(".")[1];
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)), (c) => c.charCodeAt(0))));
}

/** 구글에서 돌아옴: 코드 교환 → 계정 확인 */
export async function googleCallback(req) {
  const clear = tempCookie("oauth_state", "", 0);
  const p = req.url.searchParams;
  const state = p.get("state"), code = p.get("code");
  const cookieState = parseCookies(req.headers.cookie).oauth_state;
  const st = state && pending.get(state);
  if (!state || !code || !st || cookieState !== state || Date.now() - st.at > TTL) {
    secLog("oauth_bad_state", { ip: req.ip });
    return redirect("/?error=state", [clear]);
  }
  pending.delete(state);
  let tok;
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: CONFIG.googleClientId, client_secret: CONFIG.googleClientSecret, redirect_uri: redirectUri(req), grant_type: "authorization_code", code_verifier: st.verifier }),
    });
    tok = await r.json();
    if (!r.ok || !tok.id_token) throw new Error(tok.error ?? "token");
  } catch (e) {
    console.error("구글 토큰 교환 실패", e?.message ?? e);
    secLog("oauth_token_fail", { ip: req.ip, detail: { e: String(e?.message ?? e).slice(0, 80) } });
    return redirect("/?error=google", [clear]);
  }
  // 토큰은 구글에서 TLS로 직접 받았으므로 서명 대신 발급자·대상·만료를 확인
  const c = decodeJwt(tok.id_token);
  const okIss = c.iss === "accounts.google.com" || c.iss === "https://accounts.google.com";
  if (!okIss || c.aud !== CONFIG.googleClientId || !c.sub || c.exp * 1000 < Date.now() || c.email_verified === false) {
    secLog("oauth_bad_token", { ip: req.ip });
    return redirect("/?error=google", [clear]);
  }
  const email = String(c.email ?? "").toLowerCase();
  const isGm = !!CONFIG.initialGmEmail && email === CONFIG.initialGmEmail;
  const u = Q.userByGoogle.get(String(c.sub));
  if (!u) {
    // 처음: 닉네임 정하기
    sweep(signups);
    const ticket = b64url(rand(24));
    signups.set(ticket, { sub: String(c.sub), email, gm: isGm, at: Date.now() });
    return redirect("/?signup=1", [clear, tempCookie("signup", ticket, 600)]);
  }
  if (u.banned_until > Date.now()) {
    secLog("login_banned", { userId: u.id, username: u.username, ip: req.ip });
    return redirect("/?error=banned", [clear]);
  }
  if (isGm && u.role !== "gm") Q.setRole.run("gm", u.id);
  if (email && email !== u.email) Q.setEmail.run(email, u.id);
  Q.touchLogin.run(Date.now(), req.ip ?? null, u.id);
  const token = await createSession(u.id, req.ip);
  return redirect("/", [clear, sessionCookie(token, CONFIG.sessionDays * 86400)]);
}

/** 첫 로그인 닉네임 정하기 */
export async function finishSignup(req) {
  const ticket = parseCookies(req.headers.cookie).signup;
  const s = ticket && signups.get(ticket);
  if (!s || Date.now() - s.at > TTL) return { status: 400, body: { error: "가입 시간이 지났어요. 다시 구글로 로그인해 주세요." }, headers: {} };
  const b = await req.readJson();
  const name = typeof b.name === "string" ? b.name.trim().normalize("NFC") : "";
  if (!USERNAME_RE.test(name)) return { status: 400, body: { error: "닉네임은 2~12자, 한글·영문·숫자·_ 만 쓸 수 있어요." }, headers: {} };
  if (Q.userByName.get(name)) return { status: 400, body: { error: "이미 있는 닉네임이에요." }, headers: {} };
  if (Q.userByGoogle.get(s.sub)) return { status: 400, body: { error: "이미 가입된 구글 계정이에요. 다시 로그인해 주세요." }, headers: {} };
  const id = Number(Q.createGoogleUser.run(name, s.sub, s.email, s.gm ? "gm" : "player", Date.now()).lastInsertRowid);
  signups.delete(ticket);
  secLog("register", { userId: id, username: name, ip: req.ip });
  Q.touchLogin.run(Date.now(), req.ip ?? null, id);
  const token = await createSession(id, req.ip);
  return { status: 200, body: { ok: true, user: { name, role: s.gm ? "gm" : "player" } }, headers: { "Set-Cookie": [tempCookie("signup", "", 0), sessionCookie(token, CONFIG.sessionDays * 86400)] } };
}
