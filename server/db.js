// 저장소: SQL 드라이버만 갈아 끼우면 Node(node:sqlite)와 Cloudflare(Durable Object SQLite) 모두에서 동작
//   driver = { exec(sql), prepare(sql) → { get(...a), run(...a) → { lastInsertRowid }, all(...a) } }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  created_at INTEGER NOT NULL,
  last_login INTEGER,
  last_ip TEXT,
  banned_until INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT,
  muted_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS characters (
  user_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  cls TEXT NOT NULL DEFAULT 'adventurer',
  best_floor INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, gm_id INTEGER, gm_name TEXT, action TEXT NOT NULL, target_id INTEGER, target_name TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS security_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, user_id INTEGER, username TEXT, ip TEXT, kind TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS item_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sec_at ON security_log(at);
CREATE INDEX IF NOT EXISTS idx_item_user ON item_log(user_id, at)`;

const SQL = {
  metaGet: "SELECT v FROM meta WHERE k = ?",
  metaSet: "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
  userByName: "SELECT * FROM users WHERE username = ?",
  renameUser: "UPDATE users SET username = ? WHERE id = ?",
  userById: "SELECT * FROM users WHERE id = ?",
  userByGoogle: "SELECT * FROM users WHERE google_sub = ?",
  userByEmail: "SELECT * FROM users WHERE email = ?",
  createGoogleUser: "INSERT INTO users (username, google_sub, email, pass_hash, role, created_at) VALUES (?, ?, ?, '', ?, ?)",
  setEmail: "UPDATE users SET email = ? WHERE id = ?",
  createUser: "INSERT INTO users (username, pass_hash, role, created_at) VALUES (?, ?, ?, ?)",
  setRole: "UPDATE users SET role = ? WHERE id = ?",
  setPass: "UPDATE users SET pass_hash = ? WHERE id = ?",
  touchLogin: "UPDATE users SET last_login = ?, last_ip = ? WHERE id = ?",
  setBan: "UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?",
  setMute: "UPDATE users SET muted_until = ? WHERE id = ?",
  countUsers: "SELECT COUNT(*) AS n FROM users",
  createSession: "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)",
  sessionByHash: "SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?",
  deleteSession: "DELETE FROM sessions WHERE token_hash = ?",
  deleteUserSessions: "DELETE FROM sessions WHERE user_id = ?",
  deleteUser: "DELETE FROM users WHERE id = ?",
  deleteChar: "DELETE FROM characters WHERE user_id = ?",
  purgeSessions: "DELETE FROM sessions WHERE expires_at <= ?",
  charByUser: "SELECT * FROM characters WHERE user_id = ?",
  saveChar: `INSERT INTO characters (user_id, data, level, cls, best_floor, updated_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, level = excluded.level, cls = excluded.cls, best_floor = excluded.best_floor, updated_at = excluded.updated_at`,
  audit: "INSERT INTO audit_log (at, gm_id, gm_name, action, target_id, target_name, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
  auditList: "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?",
  sec: "INSERT INTO security_log (at, user_id, username, ip, kind, detail) VALUES (?, ?, ?, ?, ?, ?)",
  secList: "SELECT * FROM security_log ORDER BY id DESC LIMIT ?",
  secByUser: "SELECT * FROM security_log WHERE user_id = ? ORDER BY id DESC LIMIT ?",
  itemLog: "INSERT INTO item_log (at, user_id, kind, detail) VALUES (?, ?, ?, ?)",
  itemLogByUser: "SELECT * FROM item_log WHERE user_id = ? ORDER BY id DESC LIMIT ?",
  playerList: `SELECT u.id, u.username, u.email, u.role, u.created_at, u.last_login, u.last_ip, u.banned_until, u.ban_reason, u.muted_until,
                 c.level, c.cls, c.best_floor,
                 COALESCE(json_extract(c.data, '$.best2'), 0) AS best2,
                 COALESCE(json_extract(c.data, '$.best3'), 0) AS best3,
                 COALESCE(json_extract(c.data, '$.best4'), 0) AS best4,
                 COALESCE(json_extract(c.data, '$.checkpoint2'), 1) AS checkpoint2,
                 COALESCE(json_extract(c.data, '$.checkpoint3'), 1) AS checkpoint3,
                 COALESCE(json_extract(c.data, '$.checkpoint4'), 1) AS checkpoint4,
                 COALESCE(json_extract(c.data, '$.cleared3'), 0) AS cleared3,
                 COALESCE(json_extract(c.data, '$.cleared4'), 0) AS cleared4,
                 COALESCE(json_extract(c.data, '$.verdanPass'), 0) AS verdan_pass,
                 COALESCE(json_extract(c.data, '$.island'), 'erden') AS island,
                 json_extract(c.data, '$.cls2') AS cls2
               FROM users u LEFT JOIN characters c ON c.user_id = u.id WHERE u.username LIKE ? ORDER BY u.id DESC LIMIT ? OFFSET ?`,
  ranking: `SELECT u.username, c.level, c.cls, c.best_floor, COALESCE(json_extract(c.data, '$.best2'), 0) AS best2, COALESCE(json_extract(c.data, '$.best3'), 0) AS best3, COALESCE(json_extract(c.data, '$.best4'), 0) AS best4, json_extract(c.data, '$.cls2') AS cls2 FROM characters c JOIN users u ON u.id = c.user_id
            WHERE u.role = 'player' ORDER BY best4 DESC, best3 DESC, c.best_floor DESC, c.level DESC LIMIT 20`,
  trimSec: "DELETE FROM security_log WHERE at < ?",
  // PvP 결투장 순위: 레이팅 → 승수 순 (1판 이상 치른 플레이어)
  pvpTop: `SELECT u.username, c.cls, CAST(json_extract(c.data, '$.pvp.rating') AS INTEGER) AS rating, COALESCE(json_extract(c.data, '$.pvp.w'), 0) AS w,
             COALESCE(json_extract(c.data, '$.pvp.l'), 0) AS l, COALESCE(json_extract(c.data, '$.pvp.d'), 0) AS d, COALESCE(json_extract(c.data, '$.pvp.streak'), 0) AS streak
           FROM characters c JOIN users u ON u.id = c.user_id
           WHERE u.role = 'player' AND COALESCE(json_extract(c.data, '$.pvp.games'), 0) > 0 ORDER BY rating DESC, w DESC, l ASC LIMIT 50`,
};

/** 모든 쿼리 (initDb 후 사용) */
export const Q = {};

export function initDb(driver) {
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) driver.exec(stmt);
  // 구글 로그인용 열 (예전 DB에도 추가)
  for (const col of ["google_sub TEXT", "email TEXT"]) { try { driver.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch {} }
  driver.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_sub)");
  for (const [k, sql] of Object.entries(SQL)) Q[k] = driver.prepare(sql);
}

export function secLog(kind, { userId = null, username = null, ip = null, detail = null } = {}) {
  try { Q.sec.run(Date.now(), userId, username, ip, kind, detail ? JSON.stringify(detail).slice(0, 2000) : null); } catch {}
}
export function itemLog(userId, kind, detail) {
  try { Q.itemLog.run(Date.now(), userId, kind, JSON.stringify(detail).slice(0, 2000)); } catch {}
}

/** Cloudflare Durable Object SQL 드라이버 */
export function doSqlDriver(sql) {
  return {
    exec: (s) => sql.exec(s),
    prepare: (s) => ({
      get: (...a) => sql.exec(s, ...a).toArray()[0],
      all: (...a) => sql.exec(s, ...a).toArray(),
      run: (...a) => { sql.exec(s, ...a); const r = sql.exec("SELECT last_insert_rowid() AS id").one(); return { lastInsertRowid: r.id }; },
    }),
  };
}
