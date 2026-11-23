// 관리 API: 관리자 키로 로그인한 서버 주인만 쓸 수 있고, 모든 변경은 감사 기록에 남긴다
import { Q, secLog, itemLog } from "./db.js";
import { defaultLoadout, defaultLoadout2, INV_SIZE } from "./game/player.js";
import { world } from "./net.js";
import { rollItem, makeItem, RARITIES, SLOTS, canEquip, VMATS, ensureDur, makeClassRelic } from "../shared/items.js";
import { CLASS_INFO } from "../shared/classes.js";
import { MAX_LEVEL, ITEMS, TITLE_COLORS, TITLE_MAX } from "../shared/constants.js";
import { MAX_ENH } from "../shared/items.js";
import { PATHS, CLASS2_LEVEL } from "../shared/classes2.js";
import { secureRandom } from "./game/secure.js";
import { hashPassword } from "./auth.js";
import { makeMaxAbyssBundle, MAX_ABYSS_BUNDLE_COUNT } from "./gm-items.js";

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export async function handleGm(req, res, path, { readJson, send, isAdmin, ip, url }) {
  if (!isAdmin(req)) {
    secLog("gm_denied", { ip, detail: { path } });
    return send(res, 403, { error: "관리자 로그인이 필요해요." });
  }
  const audit = (action, target, detail) => Q.audit.run(Date.now(), null, "관리자", action, target?.id ?? null, target?.username ?? null, detail ? JSON.stringify(detail).slice(0, 2000) : null);
  const m = path.match(/^\/api\/gm\/player\/(\d+)(?:\/([a-z-]+))?$/);

  if (path === "/api/gm/overview" && req.method === "GET") return send(res, 200, world.stats());
  if (path === "/api/gm/players" && req.method === "GET") {
    const q = String(url.searchParams.get("q") ?? "").slice(0, 20).replace(/[%_]/g, "");
    const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) | 0);
    const rows = Q.playerList.all(`%${q}%`, 50, page * 50).map((r) => {
      const s = world.sessions.get(r.id), c = s?.char;
      return {
        ...r,
        online: !!s,
        level: c ? c.level : r.level,
        cls: c ? c.cls : r.cls,
        best_floor: c ? c.best : r.best_floor,
        best2: c ? c.best2 : r.best2,
        best3: c ? c.best3 : r.best3,
        best4: c ? c.best4 : r.best4,
        checkpoint2: c ? c.checkpoint2 : r.checkpoint2,
        checkpoint3: c ? c.checkpoint3 : r.checkpoint3,
        checkpoint4: c ? c.checkpoint4 : r.checkpoint4,
        cleared3: c ? c.cleared3 : r.cleared3,
        cleared4: c ? c.cleared4 : r.cleared4,
        verdan_pass: c ? c.verdanPass : r.verdan_pass,
        cls2: c ? c.cls2 : r.cls2,
        room: s?.unit.room?.kind ?? null,
        floor: s?.unit.room?.floor ?? null,
        dungeon: s?.unit.room?.dungeon ?? null,
        island: c ? c.island : r.island ?? "erden",
      };
    });
    return send(res, 200, { list: rows });
  }
  if (path === "/api/gm/audit" && req.method === "GET") return send(res, 200, { list: Q.auditList.all(200) });
  if (path === "/api/gm/security" && req.method === "GET") return send(res, 200, { list: Q.secList.all(300) });
  if (path === "/api/gm/announce" && req.method === "POST") {
    const b = await readJson();
    const text = typeof b.text === "string" ? b.text.replace(/[<>]/g, "").trim().slice(0, 200) : "";
    world.gmAnnounce(text || null);
    audit("announce", null, { text });
    return send(res, 200, { ok: true });
  }
  if (path === "/api/gm/broadcast" && req.method === "POST") {
    const b = await readJson();
    const text = typeof b.text === "string" ? b.text.replace(/[<>]/g, "").trim().slice(0, 200) : "";
    if (!text) return send(res, 400, { error: "내용이 비었어요." });
    world.broadcastSys(`[공지] ${text}`, "gm");
    audit("broadcast", null, { text });
    return send(res, 200, { ok: true });
  }
  if (!m) return send(res, 404, { error: "없는 관리 기능이에요." });

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
      user: { id: target.id, username: target.username, email: target.email ?? null, role: target.role, created_at: target.created_at, last_login: target.last_login, last_ip: target.last_ip, banned_until: target.banned_until, ban_reason: target.ban_reason, muted_until: target.muted_until },
      online: !!s, room: s ? { kind: s.unit.room?.kind, floor: s.unit.room?.floor, hp: Math.round(s.unit.hp), mh: s.unit.maxHp } : null,
      char, security: Q.secByUser.all(id, 50), items: Q.itemLogByUser.all(id, 50),
    });
  }
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const b = await readJson();
  // 다른 GM을 건드리는 위험 작업은 막음 (자기 자신 강등 포함)

  switch (action) {
    case "edit": {
      const ch = {};
      if (b.level !== undefined) { if (!int(b.level, 1, MAX_LEVEL)) return send(res, 400, { error: "레벨 범위가 잘못됐어요." }); ch.level = b.level; }
      // 골드·미사용 스탯 포인트에는 별도 게임 밸런스 상한을 두지 않는다.
      // 게임 전반이 Number 정수 연산을 사용하므로 정밀도를 보장하는 안전 정수만 허용한다.
      if (b.gold !== undefined) { if (!Number.isSafeInteger(b.gold) || b.gold < 0) return send(res, 400, { error: "골드는 0 이상의 정확한 정수로 입력해 주세요." }); ch.gold = b.gold; }
      if (b.unspent !== undefined) { if (!Number.isSafeInteger(b.unspent) || b.unspent < 0) return send(res, 400, { error: "스탯 포인트는 0 이상의 정확한 정수로 입력해 주세요." }); ch.unspent = b.unspent; }
      if (b.checkpoint !== undefined) { if (!int(b.checkpoint, 1, 91) || (b.checkpoint - 1) % 10) return send(res, 400, { error: "체크포인트는 1, 11, 21 … 91 이에요." }); ch.checkpoint = b.checkpoint; }
      if (b.best !== undefined) { if (!int(b.best, 0, 100)) return send(res, 400, { error: "최고 층 범위가 잘못됐어요." }); ch.best = b.best; }
      if (b.cls !== undefined) { if (!CLASS_INFO[b.cls]) return send(res, 400, { error: "없는 직업이에요." }); ch.cls = b.cls; }
      if (b.cons !== undefined) {
        if (typeof b.cons !== "object" || b.cons === null || Array.isArray(b.cons)) return send(res, 400, { error: "소모품 값이 잘못됐어요." });
        ch.cons = {};
        for (const [k, v] of Object.entries(b.cons)) if (ITEMS[k] && int(v, 0, ITEMS[k].max)) ch.cons[k] = v;
      }
      if (b.stats !== undefined && (!b.stats || typeof b.stats !== "object" || Array.isArray(b.stats))) return send(res, 400, { error: "스탯 값은 능력치별 정수로 입력해 주세요." });
      let statError = null;
      const ok = world.gmApplyChar(id, (c) => {
        const targetClass = ch.cls ?? c.cls;
        if (b.stats !== undefined) {
          const allowed = CLASS_INFO[targetClass]?.stats ?? [];
          if (!allowed.length || Object.keys(b.stats).some((k) => !allowed.includes(k)) || allowed.some((k) => !int(b.stats[k], 0, 1_000_000))) {
            statError = "선택한 직업의 능력치만 0~1,000,000 사이 정수로 지정할 수 있어요.";
            return;
          }
          ch.stats = Object.fromEntries(allowed.map((k) => [k, b.stats[k]]));
        }
        if (ch.cls && ch.cls !== c.cls) { c.unspent += Object.values(c.stats ?? {}).reduce((a, x) => a + x, 0); c.stats = {}; c.skills = c.skills.map((s) => (s && s.startsWith("c_") ? s : null)); for (const sl of ["weapon", "offhand"]) if (c.equip[sl] && !canEquip(c.equip[sl], ch.cls)) { c.inv.push(c.equip[sl]); c.equip[sl] = null; } }
        if (ch.level && ch.level !== c.level) c.xp = 0;
        const clsChanged = ch.cls && ch.cls !== c.cls;
        Object.assign(c, { ...ch, cons: { ...c.cons, ...(ch.cons ?? {}) } });
        if (clsChanged) c.skills = defaultLoadout(c); // 직업을 바꾸면 그 직업 기본 스킬 세트
      });
      if (statError) return send(res, 400, { error: statError });
      audit("edit", target, ch);
      return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: "수정 실패" });
    }
    case "progress": {
      const floorLimits = { best2: 30, best3: 100, best4: 30 };
      const checkpointLimits = { checkpoint2: 30, checkpoint3: 100, checkpoint4: 30 };
      const validCheckpoint = (v, max) => v === 1 || (v >= 11 && v <= max && (v - 1) % 10 === 0);
      const patch = {};
      for (const [k, max] of Object.entries(floorLimits)) {
        if (b[k] === undefined) continue;
        if (!int(b[k], 0, max)) return send(res, 400, { error: `${k} 범위가 잘못됐어요.` });
        patch[k] = b[k];
      }
      for (const [k, max] of Object.entries(checkpointLimits)) {
        if (b[k] === undefined) continue;
        if (!int(b[k], 1, max) || !validCheckpoint(b[k], max)) return send(res, 400, { error: `${k}는 1, 11, 21 … 층 체크포인트만 가능해요.` });
        patch[k] = b[k];
      }
      for (const k of ["cleared2", "cleared3", "cleared4", "verdanPass"]) {
        if (b[k] !== undefined && typeof b[k] !== "boolean") return send(res, 400, { error: `${k} 값이 잘못됐어요.` });
        if (b[k] !== undefined) patch[k] = b[k];
      }
      if (b.island !== undefined && !["erden", "verdan"].includes(b.island)) return send(res, 400, { error: "섬 값이 잘못됐어요." });
      if (b.cls2 !== undefined && typeof b.cls2 !== "string") return send(res, 400, { error: "2차 직업 값이 잘못됐어요." });
      let why = null;
      const ok = world.gmApplyChar(id, (c) => {
        if (patch.verdanPass === false && b.island === "verdan") { why = "입도 권한을 해제할 때는 현재 섬을 에르덴으로 선택해 주세요."; return; }
        if (b.cls2) {
          const path = PATHS[b.cls2];
          if (!path || path.base !== c.cls || c.level < CLASS2_LEVEL) { why = "현재 직업과 레벨에 맞는 2차 전직 경로가 아니에요."; return; }
          if (c.cls2 !== b.cls2) {
            c.cls2 = b.cls2;
            c.skills = defaultLoadout2(c);
          }
        } else if (b.cls2 === "" && c.cls2) {
          c.cls2 = null;
          c.skills = defaultLoadout(c);
        }
        Object.assign(c, patch);
        if (b.island !== undefined) c.island = b.island;
        if (c.island === "verdan") c.verdanPass = true;
        if (!c.verdanPass) c.island = "erden";
      });
      if (why) return send(res, 400, { error: why });
      if (!ok) return send(res, 400, { error: "진행도 수정에 실패했어요." });
      audit("edit_progress", target, { ...patch, ...(b.island !== undefined ? { island: b.island } : {}), ...(b.cls2 !== undefined ? { cls2: b.cls2 } : {}) });
      return send(res, 200, { ok: true });
    }
    case "resources": {
      const mats = b.mats && typeof b.mats === "object" && !Array.isArray(b.mats) ? b.mats : {};
      const sigils = b.sigils && typeof b.sigils === "object" && !Array.isArray(b.sigils) ? b.sigils : {};
      const matIds = new Set(VMATS.map((m) => m.id));
      for (const [k, v] of Object.entries(mats)) if (!matIds.has(k) || !int(v, 0, 999999)) return send(res, 400, { error: "베르단 재료 지급 값이 잘못됐어요." });
      for (const [k, v] of Object.entries(sigils)) if (!/^(10|[1-9])$/.test(k) || !int(v, 0, 9999)) return send(res, 400, { error: "지역 각인 지급 값이 잘못됐어요." });
      const hearts = b.hearts === undefined ? 0 : b.hearts;
      if (!int(hearts, 0, 9999)) return send(res, 400, { error: "섬 심장핵 지급 값이 잘못됐어요." });
      const details = { mats, sigils, hearts };
      let overflow = false;
      const ok = world.gmApplyChar(id, (c) => {
        c.mats ??= {}; c.sigils ??= {};
        for (const [k, v] of Object.entries(mats)) if ((c.mats[k] ?? 0) + v > 999999) overflow = true;
        for (const [k, v] of Object.entries(sigils)) if ((c.sigils[k] ?? 0) + v > 9999) overflow = true;
        if ((c.hearts ?? 0) + hearts > 9999) overflow = true;
        if (overflow) return;
        for (const [k, v] of Object.entries(mats)) c.mats[k] = (c.mats[k] ?? 0) + v;
        for (const [k, v] of Object.entries(sigils)) c.sigils[k] = (c.sigils[k] ?? 0) + v;
        c.hearts = (c.hearts ?? 0) + hearts;
      });
      if (overflow) return send(res, 400, { error: "재화 한도를 초과해요." });
      if (!ok) return send(res, 400, { error: "재화 지급에 실패했어요." });
      audit("give_verdan_resources", target, details);
      return send(res, 200, { ok: true });
    }
    case "restore": {
      const s = world.gmFind(id);
      if (!s) return send(res, 400, { error: "접속 중인 플레이어만 즉시 회복할 수 있어요." });
      const u = s.unit;
      u.dead = false; u.hp = u.maxHp; u.mp = u.maxMp;
      u.status.clear(); u.buffs.clear(); u.shield = null;
      s.sendMe?.();
      s.notice("관리자가 HP·MP를 모두 회복하고 상태 이상을 해제했어요.");
      audit("restore_player", target, { room: u.room?.id ?? null });
      return send(res, 200, { ok: true });
    }
    case "repair-all": {
      let repaired = 0;
      const ok = world.gmApplyChar(id, (c) => {
        for (const it of [...Object.values(c.equip ?? {}), ...(c.inv ?? [])]) {
          if (!it) continue;
          ensureDur(it);
          if (Number.isFinite(it.maxDur)) { it.dur = it.maxDur; repaired++; }
        }
      });
      audit("repair_all", target, { count: repaired });
      return send(res, ok ? 200 : 400, ok ? { ok: true, count: repaired } : { error: "장비 수리에 실패했어요." });
    }
    case "give-abyss-max-bundle": {
      if (target.username !== "GM_윤성") return send(res, 403, { error: "이 지급 기능은 GM_윤성 계정 전용이에요." });
      const row = Q.charByUser.get(id);
      const live = world.gmFind(id);
      let existing = null;
      try { existing = live?.char ?? (row ? JSON.parse(row.data) : null); } catch {}
      if (existing?.gmAbyssMaxSetV1) return send(res, 409, { error: "심연 풀세트는 이미 지급된 계정이에요." });
      const made = makeMaxAbyssBundle();
      if (made.length !== MAX_ABYSS_BUNDLE_COUNT) return send(res, 500, { error: "심연 풀세트 수량 검증에 실패했어요." });
      let why = null;
      const ok = world.gmApplyChar(id, (c) => {
        if (c.gmAbyssMaxSetV1) { why = "심연 풀세트는 이미 지급된 계정이에요."; return; }
        if (c.inv.length + made.length > INV_SIZE) {
          why = `가방 공간이 부족해요. ${made.length}칸이 필요하고 현재 ${INV_SIZE - c.inv.length}칸 남았어요.`;
          return;
        }
        for (const it of made) {
          it.uid = c.nextUid++;
          c.inv.push(it);
        }
        c.gmAbyssMaxSetV1 = true;
      });
      if (!ok || why) return send(res, why ? 409 : 400, { error: why ?? "심연 풀세트 지급에 실패했어요." });
      const detail = {
        count: made.length, ilvl: MAX_LEVEL, enhancement: MAX_ENH,
        options: 5, maxOptionRoll: 3, enchant: "dmg", locked: true,
        relics: made.filter((it) => it.relic).map((it) => it.relic),
        classRelics: made.filter((it) => it.classRelic).map((it) => it.classRelic),
      };
      audit("give_abyss_max_bundle", target, detail);
      itemLog(id, "gm_abyss_max_bundle", detail);
      world.sessions.get(id)?.notice(`관리자가 심연 풀세트 ${made.length}개를 지급했어요. 모두 아이템 레벨 250, +99 강화예요.`);
      return send(res, 200, { ok: true, count: made.length, ilvl: MAX_LEVEL, enhancement: MAX_ENH });
    }
    case "give-class-relic": {
      let made = null;
      const ok = world.gmApplyChar(id, (c) => {
        if (c.inv.length >= INV_SIZE) return;
        made = makeClassRelic(c.cls, MAX_LEVEL);
        if (!made) return;
        made.uid = c.nextUid++;
        c.inv.push(made);
      });
      audit("give_class_relic", target, { name: made?.name ?? null, cls: made?.classRelic ?? null });
      if (made) itemLog(id, "gm_give_class_relic", { name: made.name, rarity: made.rarity, ilvl: made.ilvl });
      if (made) world.sessions.get(id)?.notice(`관리자가 직업 전용 심연 무기 [${made.name}]을(를) 지급했어요.`);
      return send(res, ok && made ? 200 : 400, ok && made ? { ok: true, item: made } : { error: "가방이 가득 찼거나 지급에 실패했어요." });
    }
    case "give": {
      const rarity = RARITIES.includes(b.rarity) ? b.rarity : "일반";
      const ilvl = int(b.ilvl, 1, 250) ? b.ilvl : 1;
      let made = null;
      const ok = world.gmApplyChar(id, (c) => {
        if (c.inv.length >= INV_SIZE) return;
        let it;
        for (let k = 0; k < 30; k++) { it = rollItem(secureRandom, { ilvl, cls: c.cls, rarity }); if (!b.slot || it.slot === b.slot) break; }
        it.uid = c.nextUid++;
        c.inv.push(it);
        made = it;
      });
      audit("give_item", target, { rarity, ilvl, name: made?.name ?? null });
      return send(res, ok && made ? 200 : 400, ok && made ? { ok: true, item: made } : { error: "가방이 가득 찼거나 실패했어요." });
    }
    case "give-exact": {
      // 관리자가 고른 그대로 (부위·종류·등급·레벨·강화·옵션·신화 효과·인챈트)
      const spec = b.spec && typeof b.spec === "object" ? b.spec : {};
      const opts = Array.isArray(spec.opts) ? spec.opts.slice(0, 4).map((o) => ({ k: String(o?.k ?? ""), v: Number(o?.v) })) : [];
      const clean = { slot: String(spec.slot ?? ""), type: String(spec.type ?? ""), variant: Number(spec.variant) || 0, rarity: String(spec.rarity ?? ""), ilvl: Number(spec.ilvl) || 1, enh: Number(spec.enh) || 0, opts,
        mythic: String(spec.mythic ?? ""), title: String(spec.title ?? ""), ench: spec.ench ? String(spec.ench) : null, mat: spec.mat === "" || spec.mat == null ? null : Number(spec.mat) };
      if (!SLOTS.includes(clean.slot) || !RARITIES.includes(clean.rarity)) return send(res, 400, { error: "부위·등급을 골라 주세요." });
      let made = null;
      const ok = world.gmApplyChar(id, (c) => {
        if (c.inv.length >= INV_SIZE) return;
        const it = makeItem(clean);
        if (!it) return;
        it.uid = c.nextUid++;
        c.inv.push(it);
        made = it;
      });
      audit("give_item_exact", target, { name: made?.name ?? null, rarity: clean.rarity, ilvl: clean.ilvl, enh: clean.enh, opts: made?.opts, mythic: made?.mythic ?? null, ench: made?.ench ?? null });
      if (made) world.sessions.get(id)?.notice(`관리자가 [${made.name}${made.enh ? " +" + made.enh : ""}]을(를) 가방에 넣어 줬어요.`);
      return send(res, ok && made ? 200 : 400, ok && made ? { ok: true, item: made } : { error: "가방이 가득 찼거나 실패했어요." });
    }
    case "give-title": {
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (text.length < 1 || text.length > TITLE_MAX) return send(res, 400, { error: `칭호는 1~${TITLE_MAX}자예요.` });
      const color = TITLE_COLORS.includes(b.color) ? b.color : TITLE_COLORS[0];
      let made = null;
      const ok = world.gmApplyChar(id, (c) => {
        c.titles = Array.isArray(c.titles) ? c.titles : [];
        if (c.titles.length >= 50) return;
        c.titleSeq = Math.max(c.titleSeq ?? 0, ...c.titles.map((t) => t.id)) + 1;
        made = { id: c.titleSeq, text, color, at: Date.now() };
        c.titles.push(made);
      });
      world.gmTitleNotice?.(id, made);
      audit("give_title", target, { text, color });
      return send(res, ok && made ? 200 : 400, ok && made ? { ok: true } : { error: "칭호를 줄 수 없어요. (최대 50개)" });
    }
    case "remove-title": {
      if (!int(b.tid, 1, 1e6)) return send(res, 400, { error: "tid" });
      let removed = null;
      world.gmApplyChar(id, (c) => {
        const i = (c.titles ?? []).findIndex((t) => t.id === b.tid);
        if (i >= 0) { removed = c.titles.splice(i, 1)[0]; if (c.title === b.tid) c.title = null; }
      });
      world.gmTitleNotice?.(id, null);
      audit("remove_title", target, { text: removed?.text ?? null });
      return send(res, 200, { ok: !!removed });
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
    case "reset-password": {
      // 비밀번호를 잊은 플레이어용: 임시 비밀번호를 만들어 관리자에게만 보여 줌
      const abc = "abcdefghjkmnpqrstuvwxyz", num = "23456789";
      let pw = "";
      for (let i = 0; i < 6; i++) pw += abc[Math.floor(secureRandom() * abc.length)];
      for (let i = 0; i < 4; i++) pw += num[Math.floor(secureRandom() * num.length)];
      Q.setPass.run(await hashPassword(pw), target.id);
      Q.deleteUserSessions.run(target.id);
      world.gmKick(target.id, "비밀번호가 초기화됐어요. 새 비밀번호로 다시 로그인해 주세요.");
      audit("reset_password", target, null);
      return send(res, 200, { ok: true, tempPassword: pw });
    }
    case "rename": {
      const err = world.gmRename(id, b.name);
      if (err) return send(res, 400, { error: err });
      audit("rename", target, { from: target.username, to: String(b.name).trim() });
      return send(res, 200, { ok: true });
    }
    case "delete-account": {
      // 실수 방지: 닉네임을 그대로 입력해야 지워짐
      if (b.confirm !== target.username) return send(res, 400, { error: "확인용 닉네임이 맞지 않아요." });
      audit("delete_account", target, { username: target.username, level: Q.charByUser.get(id)?.level ?? null });
      world.gmDeleteAccount(id);
      return send(res, 200, { ok: true, deleted: true });
    }
    case "kick": {
      const ok = world.gmKick(id, typeof b.reason === "string" ? b.reason.slice(0, 100) : "");
      audit("kick", target, { reason: b.reason });
      return send(res, 200, { ok });
    }
    case "ban": {
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
      const dg = [1, 2, 3, 4].includes(b.dungeon) ? b.dungeon : 1;
      const maxF = dg === 2 || dg === 4 ? 30 : 100;
      if (!int(b.floor, 1, maxF)) return send(res, 400, { error: `이 던전은 1~${maxF}층이에요.` });
      const ok = world.gmWarp(id, b.floor, dg);
      audit("warp", target, { floor: b.floor, dungeon: dg });
      return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: "접속 중인 플레이어만 이동시킬 수 있어요." });
    }
  }
  return send(res, 404, { error: "없는 관리 기능이에요." });
}
