// 링크 데모용 저장소: 서버 DB 대신 브라우저 localStorage
const KEY = "psim_save_v1";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } };
const noop = { get() { return undefined; }, run() { return {}; }, all() { return []; } };
export const Q = new Proxy({
  charByUser: { get: () => { const d = read(); return d ? { data: d } : undefined; } },
  saveChar: { run: (_id, data) => { try { localStorage.setItem(KEY, data); } catch {} return {}; } },
  ranking: { all: () => [] },
}, { get: (t, k) => t[k] ?? noop });
export const db = null;
export function secLog() {}
export function itemLog() {}
