// GM API: 모든 요청은 서버에서 GM 권한을 확인하고, 모든 변경은 감사 기록에 남긴다
import { Q, secLog } from "./db.js";
import { world } from "./net.js";
import { hashPassword, validatePassword } from "./auth.js";
import { rollItem, RARITIES, SLOTS, canEquip } from "../shared/items.js";
import { CLASS_INFO } from "../shared/classes.js";
import { MAX_LEVEL, ITEMS } from "../shared/constants.js";
import { secureRandom } from "./game/secure.js";

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export async function handleGm(req, res, path, { readJson, send, currentUser, ip, url }) {
  const gm = currentUser(req);
  if (!gm || gm.role !== "gm") {
    secLog("gm_denied", { userId: gm?.id ?? null, username: gm?.username ?? null, ip, detail: { path } });
    return send(res, 403, { error: "GM 권한이 필요해요." });
  }
  const audit = (action, target, detail) => Q.audit.run(Date.now(), gm.id, gm.username, action, target?.id ?? null, target?.username ?? null, detail ? JSON.stringify(detail).slice(0, 2000) : null);
  const m = path.match(/^\/api\/gm\/player\/(\d+)(?:\/([a-z-]+))?$/);

  if (path === "/api/gm/overview" && req.method === "GET") return send(res, 200, world.stats());
  if (path === "/api/gm/players" && req.method === "GET") {
    const q = String(url.searchParams.get("q") ?? "").slice(0, 20).replace(/[%_]/g, "");
    const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) | 0);
    const rows = Q.playerList.all(`%${q}%`, 50, page * 50).map((r) => ({ ...r, online: world.sessions.has(r.id), room: world.sessions.get(r.id)?.unit.room?.kind ?? null, floor: world.sessions.get(r.id)?.unit.room?.floor ?? null }));
    return send(res, 200, { list: rows });
  }
  if (path === "/api/gm/audit" && req.method === "GET") return send(res, 200, { list: Q.auditList.all(200) });
  if (path === "/api/gm/security" && req.method === "GET") return send(res, 200, { list: Q.secList.all(300) });
  if (path === "/api/gm/announce" && req.method === "POST") {
    const b = await readJson(req);
    const text = typeof b.text === "string" ? b.text.replace(/[<>]/g, "").trim().slice(0, 200) : "";
    world.gmAnnounce(text || null);
    audit("announce", null, { text });
    return send(res, 200, { ok: true });
  }
  if (path === "/api/gm/broadcast" && req.method === "POST") {
    const b = await readJson(req);
    const text = typeof b.text === "string" ? b.text.replace(/[<>]/g, "").trim().slice(0, 200) : "";
    if (!text) return send(res, 400, { error: "내용이 비었어요." });
    world.broadcastSys(`[GM] ${text}`, "gm");
    audit("broadcast", null, { text });
    return send(res, 200, { ok: true });
  }
  if (!m) return send(res, 404, { error: "없는 GM 기능이에요." });

  const id = Number(m[1]);
  const target = Q.userById.get(id);
  if (!target) return send(res, 404, { error: "없는 플레이어예요." });
  const action = m[2] ?? "";

  if (!action && req.method === "GET") {
    const row = Q.charByUser.get(id);
    const s = world.gmFind(id);
    let char = null;
    try { char = s ? s.char : row ? JSON.parse(row.data) : null; } catch {}
    return send(res, 200, {
      user: { id: target.id, username: target.username, role: target.role, created_at: target.created_at, last_login: target.last_login, last_ip: target.last_ip, banned_until: target.banned_until, ban_reason: target.ban_reason, muted_until: target.muted_until },
      online: !!s, room: s ? { kind: s.unit.room?.kind, floor: s.unit.room?.floor, hp: Math.round(s.unit.hp), mh: s.unit.maxHp } : null,
      char, security: Q.secByUser.all(id, 50), items: Q.itemLogByUser.all(id, 50),
    });
  }
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const b = await readJson(req);
  // 다른 GM을 건드리는 위험 작업은 막음 (자기 자신 강등 포함)
  const protectedTarget = target.role === "gm" && target.id !== gm.id;

  switch (action) {
    case "edit": {
      const ch = {};
      if (b.level !== undefined) { if (!int(b.level, 1, MAX_LEVEL)) return send(res, 400, { error: "레벨 범위가 잘못됐어요." }); ch.level = b.level; }
      if (b.gold !== undefined) { if (!int(b.gold, 0, 1e9)) return send(res, 400, { error: "골드 범위가 잘못됐어요." }); ch.gold = b.gold; }
      if (b.unspent !== undefined) { if (!int(b.unspent, 0, 1000)) return send(res, 400, { error: "스탯 포인트 범위가 잘못됐어요." }); ch.unspent = b.unspent; }
      if (b.checkpoint !== undefined) { if (!int(b.checkpoint, 1, 91) || (b.checkpoint - 1) % 10) return send(res, 400, { error: "체크포인트는 1, 11, 21 … 91 이에요." }); ch.checkpoint = b.checkpoint; }
      if (b.best !== undefined) { if (!int(b.best, 0, 100)) return send(res, 400, { error: "최고 층 범위가 잘못됐어요." }); ch.best = b.best; }
      if (b.cls !== undefined) { if (!CLASS_INFO[b.cls]) return send(res, 400, { error: "없는 직업이에요." }); ch.cls = b.cls; }
      if (b.cons !== undefined) {
        if (typeof b.cons !== "object") return send(res, 400, { error: "소모품 값이 잘못됐어요." });
        ch.cons = {};
        for (const [k, v] of Object.entries(b.cons)) if (ITEMS[k] && int(v, 0, ITEMS[k].max)) ch.cons[k] = v;
      }
      const ok = world.gmApplyChar(id, (c) => {
        if (ch.cls && ch.cls !== c.cls) { c.unspent += Object.values(c.stats ?? {}).reduce((a, x) => a + x, 0); c.stats = {}; c.skills = c.skills.map((s) => (s && s.startsWith("c_") ? s : null)); for (const sl of ["weapon", "offhand"]) if (c.equip[sl] && !canEquip(c.equip[sl], ch.cls)) { c.inv.push(c.equip[sl]); c.equip[sl] = null; } }
        if (ch.level && ch.level !== c.level) c.xp = 0;
        Object.assign(c, { ...ch, cons: { ...c.cons, ...(ch.cons ?? {}) } });
      });
      audit("edit", target, ch);
      return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: "수정 실패" });
    }
    case "give": {
      const rarity = RARITIES.includes(b.rarity) ? b.rarity : "일반";
      const ilvl = int(b.ilvl, 1, 100) ? b.ilvl : 1;
      let made = null;
      const ok = world.gmApplyChar(id, (c) => {
        if (c.inv.length >= 40) return;
        let it;
        for (let k = 0; k < 30; k++) { it = rollItem(secureRandom, { ilvl, cls: c.cls, rarity }); if (!b.slot || it.slot === b.slot) break; }
        it.uid = c.nextUid++;
        c.inv.push(it);
        made = it;
      });
      audit("give_item", target, { rarity, ilvl, name: made?.name ?? null });
      return send(res, ok && made ? 200 : 400, ok && made ? { ok: true, item: made } : { error: "가방이 가득 찼거나 실패했어요." });
    }
    case "remove-item": {
      if (!int(b.uid, 1, 2 ** 31)) return send(res, 400, { error: "uid" });
      let removed = null;
      world.gmApplyChar(id, (c) => {
        const i = c.inv.findIndex((x) => x.uid === b.uid);
        if (i >= 0) removed = c.inv.splice(i, 1)[0];
        else for (const k of SLOTS) if (c.equip[k]?.uid === b.uid) { removed = c.equip[k]; c.equip[k] = null; }
      });
      audit("remove_item", target, { uid: b.uid, name: removed?.name ?? null });
      return send(res, 200, { ok: !!removed });
    }
    case "kick": {
      const ok = world.gmKick(id, typeof b.reason === "string" ? b.reason.slice(0, 100) : "");
      audit("kick", target, { reason: b.reason });
      return send(res, 200, { ok });
    }
    case "ban": {
      if (protectedTarget || target.id === gm.id) return send(res, 403, { error: "GM 계정은 차단할 수 없어요." });
      if (!(typeof b.hours === "number" && b.hours >= 0 && b.hours <= 24 * 365 * 10)) return send(res, 400, { error: "기간이 잘못됐어요." });
      const until = b.hours === 0 ? 0 : Date.now() + b.hours * 3600e3;
      const reason = typeof b.reason === "string" ? b.reason.slice(0, 200) : null;
      Q.setBan.run(until, reason, id);
      if (until) { Q.deleteUserSessions.run(id); world.gmKick(id, `이용이 제한됐어요. 사유: ${reason ?? "-"}`); }
      audit(until ? "ban" : "unban", target, { hours: b.hours, reason });
      return send(res, 200, { ok: true });
    }
    case "mute": {
      if (!(typeof b.minutes === "number" && b.minutes >= 0 && b.minutes <= 60 * 24 * 365)) return send(res, 400, { error: "기간이 잘못됐어요." });
      const until = b.minutes === 0 ? 0 : Date.now() + b.minutes * 60e3;
      Q.setMute.run(until, id);
      const s = world.gmFind(id);
      if (s) { s.mutedUntil = until; s.notice(until ? `채팅이 ${b.minutes}분 동안 금지됐어요.` : "채팅 금지가 풀렸어요."); }
      audit(until ? "mute" : "unmute", target, { minutes: b.minutes });
      return send(res, 200, { ok: true });
    }
    case "town": {
      const ok = world.gmTeleportTown(id);
      audit("to_town", target, null);
      return send(res, 200, { ok });
    }
    case "warp": {
      if (!int(b.floor, 1, 100)) return send(res, 400, { error: "층은 1~100이에요." });
      const ok = world.gmWarp(id, b.floor);
      audit("warp", target, { floor: b.floor });
      return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: "접속 중인 플레이어만 이동시킬 수 있어요." });
    }
    case "role": {
      if (!["player", "gm"].includes(b.role)) return send(res, 400, { error: "역할이 잘못됐어요." });
      if (target.id === gm.id) return send(res, 403, { error: "자기 자신의 권한은 바꿀 수 없어요." });
      if (protectedTarget && b.role !== "gm") return send(res, 403, { error: "다른 GM의 권한은 내릴 수 없어요." });
      Q.setRole.run(b.role, id);
      Q.deleteUserSessions.run(id);
      world.gmKick(id, "권한이 바뀌어 다시 로그인해야 해요.");
      audit("role", target, { role: b.role });
      return send(res, 200, { ok: true });
    }
    case "reset-password": {
      if (protectedTarget) return send(res, 403, { error: "다른 GM의 비밀번호는 바꿀 수 없어요." });
      const err = validatePassword(b.password);
      if (err) return send(res, 400, { error: err });
      Q.setPass.run(hashPassword(b.password), id);
      Q.deleteUserSessions.run(id);
      world.gmKick(id, "비밀번호가 재설정됐어요. 다시 로그인해 주세요.");
      audit("reset_password", target, null);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: "없는 GM 기능이에요." });
}
