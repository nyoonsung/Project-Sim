// SQLite 저장소 (Node 내장 node:sqlite — 별도 네이티브 모듈 없음)
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CONFIG } from "./config.js";

mkdirSync(dirname(CONFIG.dbPath), { recursive: true });
export const db = new DatabaseSync(CONFIG.dbPath);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
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
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS characters (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  cls TEXT NOT NULL DEFAULT 'adventurer',
  best_floor INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  gm_id INTEGER,
  gm_name TEXT,
  action TEXT NOT NULL,
  target_id INTEGER,
  target_name TEXT,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS security_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id INTEGER,
  username TEXT,
  ip TEXT,
  kind TEXT NOT NULL,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS item_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sec_at ON security_log(at);
CREATE INDEX IF NOT EXISTS idx_item_user ON item_log(user_id, at);
`);

const q = (sql) => db.prepare(sql);
export const Q = {
  userByName: q("SELECT * FROM users WHERE username = ?"),
  userById: q("SELECT * FROM users WHERE id = ?"),
  createUser: q("INSERT INTO users (username, pass_hash, role, created_at) VALUES (?, ?, ?, ?)"),
  setRole: q("UPDATE users SET role = ? WHERE id = ?"),
  setPass: q("UPDATE users SET pass_hash = ? WHERE id = ?"),
  touchLogin: q("UPDATE users SET last_login = ?, last_ip = ? WHERE id = ?"),
  setBan: q("UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?"),
  setMute: q("UPDATE users SET muted_until = ? WHERE id = ?"),
  countUsers: q("SELECT COUNT(*) AS n FROM users"),

  createSession: q("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?)"),
  sessionByHash: q("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?"),
  deleteSession: q("DELETE FROM sessions WHERE token_hash = ?"),
  deleteUserSessions: q("DELETE FROM sessions WHERE user_id = ?"),
  purgeSessions: q("DELETE FROM sessions WHERE expires_at <= ?"),

  charByUser: q("SELECT * FROM characters WHERE user_id = ?"),
  saveChar: q(`INSERT INTO characters (user_id, data, level, cls, best_floor, updated_at) VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, level = excluded.level, cls = excluded.cls, best_floor = excluded.best_floor, updated_at = excluded.updated_at`),

  audit: q("INSERT INTO audit_log (at, gm_id, gm_name, action, target_id, target_name, detail) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  auditList: q("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?"),
  sec: q("INSERT INTO security_log (at, user_id, username, ip, kind, detail) VALUES (?, ?, ?, ?, ?, ?)"),
  secList: q("SELECT * FROM security_log ORDER BY id DESC LIMIT ?"),
  secByUser: q("SELECT * FROM security_log WHERE user_id = ? ORDER BY id DESC LIMIT ?"),
  itemLog: q("INSERT INTO item_log (at, user_id, kind, detail) VALUES (?, ?, ?, ?)"),
  itemLogByUser: q("SELECT * FROM item_log WHERE user_id = ? ORDER BY id DESC LIMIT ?"),

  playerList: q(`SELECT u.id, u.username, u.role, u.created_at, u.last_login, u.last_ip, u.banned_until, u.ban_reason, u.muted_until,
                        c.level, c.cls, c.best_floor
                 FROM users u LEFT JOIN characters c ON c.user_id = u.id
                 WHERE u.username LIKE ? ORDER BY u.id DESC LIMIT ? OFFSET ?`),
  ranking: q(`SELECT u.username, c.level, c.cls, c.best_floor FROM characters c JOIN users u ON u.id = c.user_id
              WHERE u.role = 'player' ORDER BY c.best_floor DESC, c.level DESC LIMIT 20`),
};

export function secLog(kind, { userId = null, username = null, ip = null, detail = null } = {}) {
  try { Q.sec.run(Date.now(), userId, username, ip, kind, detail ? JSON.stringify(detail).slice(0, 2000) : null); } catch {}
}
export function itemLog(userId, kind, detail) {
  try { Q.itemLog.run(Date.now(), userId, kind, JSON.stringify(detail).slice(0, 2000)); } catch {}
}
