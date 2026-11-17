// Cloudflare 진입점: 정적 파일은 Workers Assets, /api·/ws 는 게임 서버(Durable Object 하나)로
import { DurableObject } from "cloudflare:workers";
import { applyEnv, CONFIG } from "../server/config.js";
import { initDb, doSqlDriver, Q } from "../server/db.js";
import { handleApi, wsAuth, ensureInitialGm } from "../server/api.js";
import { attachSocket, initWorld } from "../server/net.js";

const lower = (headers) => { const o = {}; for (const [k, v] of headers) o[k.toLowerCase()] = v; return o; };

export class GameServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    applyEnv({ GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET, INITIAL_GM_EMAIL: env.INITIAL_GM_EMAIL, PUBLIC_URL: env.PUBLIC_URL, DEV_LOGIN: env.DEV_LOGIN, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS, REGISTRATION_OPEN: env.REGISTRATION_OPEN, MAX_CONN_PER_IP: env.MAX_CONN_PER_IP, NODE_ENV: "production" });
    initDb(doSqlDriver(ctx.storage.sql));
    this.ready = ctx.blockConcurrencyWhile(() => ensureInitialGm());
    this.conn = new Map();
  }

  async fetch(request) {
    await this.ready;
    const world = initWorld();
    const url = new URL(request.url);
    const headers = lower(request.headers);
    const ip = (headers["cf-connecting-ip"] ?? "?").slice(0, 64);
    const req = {
      method: request.method, path: url.pathname, url, headers, ip,
      readJson: async () => {
        if (!String(headers["content-type"] ?? "").startsWith("application/json")) throw new Error("type");
        const text = await request.text();
        if (text.length > 8192) throw new Error("size");
        try { return JSON.parse(text || "{}"); } catch { throw new Error("json"); }
      },
    };
    if (url.pathname === "/ws") {
      if (headers.upgrade?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
      const a = await wsAuth(req);
      if (!a.user) return new Response(null, { status: a.status });
      if ((this.conn.get(ip) ?? 0) >= CONFIG.maxConnectionsPerIp) return new Response(null, { status: 429 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.conn.set(ip, (this.conn.get(ip) ?? 0) + 1);
      let open = true;
      const closeHandlers = [];
      server.addEventListener("close", () => { open = false; this.conn.set(ip, Math.max(0, (this.conn.get(ip) ?? 1) - 1)); for (const f of closeHandlers) f(); });
      server.addEventListener("error", () => { open = false; });
      attachSocket({
        onMessage: (fn) => server.addEventListener("message", (ev) => {
          const d = ev.data;
          if (typeof d === "string") fn(d, d.length);
          else fn(null, d?.byteLength ?? 0);
        }),
        onClose: (fn) => closeHandlers.push(fn),
        send: (t) => server.send(t),
        close: (c, w) => { try { server.close(c, w); } catch {} },
        isOpen: () => open,
      }, a.user, ip);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.startsWith("/api/")) {
      // 오래된 세션·보안 기록 정리 (가끔)
      if (Math.random() < 0.01) { Q.purgeSessions.run(Date.now()); Q.trimSec.run(Date.now() - 30 * 864e5); }
      const out = await handleApi(req);
      const h = new Headers({ "Cache-Control": "no-store" });
      for (const [k, v] of Object.entries(out.headers ?? {})) for (const x of [].concat(v)) h.append(k, x);
      if (out.body == null) return new Response(null, { status: out.status, headers: h });
      h.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(out.body), { status: out.status, headers: h });
    }
    return new Response("not found", { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws" || url.pathname.startsWith("/api/")) {
      const stub = env.GAME.get(env.GAME.idFromName("main"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
