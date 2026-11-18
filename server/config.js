// 설정. 바꿀 값은 환경 변수로 (예: PORT=4000)
export const CONFIG = {};

export function applyEnv(env = {}) {
  Object.assign(CONFIG, {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "0.0.0.0",
    dbPath: env.DB_PATH ?? null,
    secureCookies: env.SECURE_COOKIES === "1" || env.NODE_ENV === "production",
    allowedOrigins: String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === "1",
    sessionDays: 14,
    adminKey: env.ADMIN_KEY ?? null,
    maxConnectionsPerIp: Number(env.MAX_CONN_PER_IP ?? 300),
    registrationOpen: env.REGISTRATION_OPEN !== "0",
  });
}
applyEnv(typeof process !== "undefined" && process.env ? process.env : {});
