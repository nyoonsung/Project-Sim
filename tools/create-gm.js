// 이미 가입한 계정을 GM으로 지정 (Node 로컬 DB용). 실서버(Cloudflare)는 INITIAL_GM_EMAIL 비밀값이나 GM 패널을 쓴다.
//   npm run create-gm -- <닉네임>
import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../server/config.js";
import { initDb, Q } from "../server/db.js";

const dbPath = CONFIG.dbPath ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data", "game.db");
const sqlite = new DatabaseSync(dbPath);
initDb({ exec: (s) => sqlite.exec(s), prepare: (s) => sqlite.prepare(s) });
const [name] = process.argv.slice(2);
const u = name && Q.userByName.get(name);
if (!u) { console.error("사용법: npm run create-gm -- <이미 가입한 닉네임>"); process.exit(1); }
Q.setRole.run("gm", u.id);
Q.deleteUserSessions.run(u.id);
console.log(`${name} 계정을 GM으로 지정했어요. 다시 로그인하면 적용돼요.`);
