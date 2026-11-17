// 환경 변수 설정. 비밀값은 코드에 넣지 말고 환경 변수로.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;

export const CONFIG = {
  root,
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? "0.0.0.0",
  dbPath: env.DB_PATH ?? join(root, "data", "game.db"),
  // https로 배포하면 true → 쿠키에 Secure
  secureCookies: env.SECURE_COOKIES === "1" || env.NODE_ENV === "production",
  // 허용 출처(웹소켓 Origin 검사). 비우면 요청 Host와 같은 출처만 허용
  allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  // 프록시(Render 등) 뒤에서 실제 IP 읽기
  trustProxy: env.TRUST_PROXY === "1" || !!env.RENDER,
  sessionDays: 14,
  // 첫 실행 때 GM 계정 자동 생성(선택): INITIAL_GM_USER / INITIAL_GM_PASS
  initialGmUser: env.INITIAL_GM_USER ?? null,
  initialGmPass: env.INITIAL_GM_PASS ?? null,
  maxConnectionsPerIp: Number(env.MAX_CONN_PER_IP ?? 6),
  registrationOpen: env.REGISTRATION_OPEN !== "0",
};
