// 설정. 비밀값은 코드에 넣지 말고 환경 변수로. (Node는 process.env, Cloudflare는 env 바인딩을 applyEnv로)
export const CONFIG = {};

export function applyEnv(env = {}) {
  Object.assign(CONFIG, {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "0.0.0.0",
    dbPath: env.DB_PATH ?? null,
    secureCookies: env.SECURE_COOKIES === "1" || env.NODE_ENV === "production",
    allowedOrigins: String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === "1" || !!env.RENDER,
    sessionDays: 14,
    initialGmUser: env.INITIAL_GM_USER ?? null,
    initialGmPass: env.INITIAL_GM_PASS ?? null,
    maxConnectionsPerIp: Number(env.MAX_CONN_PER_IP ?? 6),
    registrationOpen: env.REGISTRATION_OPEN !== "0",
  });
}
applyEnv(typeof process !== "undefined" && process.env ? process.env : {});
