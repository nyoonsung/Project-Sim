// 관리자 키를 새로 만든다 (키가 남에게 보였을 때). 서버를 다시 켜면 새 키가 적용된다.
//   npm run new-admin-key
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../server/config.js";
import { newAdminKey } from "../server/admin.js";

const dbPath = CONFIG.dbPath ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data", "game.db");
mkdirSync(dirname(dbPath), { recursive: true });
const key = newAdminKey();
writeFileSync(join(dirname(dbPath), "admin-key.txt"), key + "\n");
console.log("새 관리자 키를 만들었어요. 서버를 다시 켜면 서버 창에 새 관리자 주소가 나와요.");
