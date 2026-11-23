// 캐릭터 데이터(저장용)와 플레이어 유닛(접속 중)
import { deriveStats } from "../../shared/stats.js";
import { CLASS_INFO, xpToNext, stageOf } from "../../shared/classes.js";
import { SKILLS, unlockStage, adventurerBasic } from "../../shared/skills.js";
import { MAX_LEVEL, STAT_POINTS_PER_LEVEL, PLAYER_RADIUS, ITEMS, TITLE_COLORS, TITLE_MAX, INVENTORY_SLOTS, SKILL_SLOTS } from "../../shared/constants.js";
import { starterGear, ensureDur, upgradeMythic, syncMythic, ensureAbyss, syncAbyss, VMATS } from "../../shared/items.js";
import { PATHS, TIER_LEVEL, CLASS2_LEVEL } from "../../shared/classes2.js";

export const INV_SIZE = INVENTORY_SLOTS;

export function newCharacter(name) {
  const g = starterGear();
  return {
    v: 1, name, level: 1, xp: 0, cls: "adventurer", stats: {}, unspent: 0, prof: {}, titles: [], title: null,
    skills: ["c_thrust", "c_slash", null, null, null, null, null, null, null, null, "c_dash", "c_firstaid"],
    equip: { weapon: { uid: 1, ...g.weapon }, offhand: { uid: 2, ...g.offhand }, helmet: null, armor: null, trinket: null },
    inv: [], nextUid: 3, cons: { hp_potion: 5, antidote: 2, mp_potion: 2 }, gold: 100,
    best: 0, checkpoint: 1, cleared: false,
    best2: 0, checkpoint2: 1, cleared2: false, abyssKeys: 0, riftCrystals: 0,
    // 2차 업데이트: 섬·베르단 던전 진행도·2차 전직·베르단 재료
    island: "erden", verdanPass: false, cls2: null,
    best3: 0, checkpoint3: 1, cleared3: false, best4: 0, checkpoint4: 1, cleared4: false,
    mats: {}, sigils: {}, hearts: 0, reward250: false,
    kills: 0, deaths: 0, playtime: 0, created: Date.now(),
  };
}

/** 저장 데이터 정리(이상한 값이 들어와도 안전하게) */
export function sanitizeChar(c, name) {
  const d = newCharacter(name);
  if (!c || typeof c !== "object") return d;
  const out = { ...d, ...c, name };
  if (!CLASS_INFO[out.cls]) out.cls = "adventurer";
  out.level = Math.max(1, Math.min(MAX_LEVEL, out.level | 0));
  // 새 진행도 필드는 기존 저장 데이터에도 기본값을 채워 세이브 호환성을 유지한다.
  out.best2 = Math.max(0, Math.min(30, Number.isFinite(out.best2) ? out.best2 | 0 : 0));
  out.checkpoint2 = Math.max(1, Math.min(30, Number.isFinite(out.checkpoint2) ? out.checkpoint2 | 0 : 1));
  out.cleared2 = !!out.cleared2;
  const clampInt = (v, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v | 0 : dflt));
  out.best3 = clampInt(out.best3, 0, 100, 0); out.checkpoint3 = clampInt(out.checkpoint3, 1, 100, 1); out.cleared3 = !!out.cleared3;
  out.best4 = clampInt(out.best4, 0, 30, 0); out.checkpoint4 = clampInt(out.checkpoint4, 1, 30, 1); out.cleared4 = !!out.cleared4;
  out.verdanPass = !!out.verdanPass;
  out.island = out.island === "verdan" && out.verdanPass ? "verdan" : "erden";
  if (!PATHS[out.cls2] || PATHS[out.cls2].base !== out.cls || out.level < CLASS2_LEVEL) out.cls2 = null;
  const mats = {};
  for (const m of VMATS) mats[m.id] = clampInt(out.mats?.[m.id], 0, 999999, 0);
  out.mats = mats;
  const sig = {};
  for (let z = 1; z <= 10; z++) sig[z] = clampInt(out.sigils?.[z], 0, 9999, 0);
  out.sigils = sig;
  out.hearts = clampInt(out.hearts, 0, 9999, 0);
  out.reward250 = !!out.reward250;
  out.abyssKeys = Math.max(0, Math.min(9999, Number.isFinite(out.abyssKeys) ? out.abyssKeys | 0 : 0));
  out.riftCrystals = Math.max(0, Math.min(999999, Number.isFinite(out.riftCrystals) ? out.riftCrystals | 0 : 0));
  if (!Array.isArray(out.skills)) out.skills = d.skills.slice();
  else if (out.skills.length === 8) {
    // 기존 8칸 세이브는 기본 공격·전투 스킬을 유지하고 대시·응급처치를 뒤쪽 고정 칸으로 이동한다.
    const core = out.skills.slice(0, 6).map((id) => id === "c_dash" || id === "c_firstaid" ? null : id);
    out.skills = [...core, null, null, null, null, "c_dash", "c_firstaid"];
  } else if (out.skills.length < SKILL_SLOTS) out.skills = [...out.skills, ...Array(SKILL_SLOTS - out.skills.length).fill(null)];
  else if (out.skills.length > SKILL_SLOTS) out.skills = out.skills.slice(0, SKILL_SLOTS);
  if (!Array.isArray(out.inv)) out.inv = [];
  out.cons = { ...d.cons, ...(out.cons ?? {}) };
  // 스킬 숙련도: { 스킬id: 경험치 } (알 수 없는 스킬·잘못된 값 제거)
  const prof = {};
  if (out.prof && typeof out.prof === "object") for (const [k, v] of Object.entries(out.prof)) if (SKILLS[k] && Number.isFinite(v) && v > 0) prof[k] = Math.min(Math.floor(v), 1e7);
  out.prof = prof;
  // 모험가 기본 공격은 든 무기에 맞춤 (활 → 활쏘기, 지팡이 → 마력탄)
  if (out.cls === "adventurer" && Array.isArray(out.skills)) out.skills[0] = adventurerBasic(out.equip?.weapon?.type);
  out.equip = { ...d.equip, ...(out.equip ?? {}) };
  // 구형 저장 데이터의 문자열·중복 UID를 정리해 화면과 서버가 같은 번호를 사용하게 한다.
  const usedUids = new Set();
  let nextUid = Number.isSafeInteger(out.nextUid) && out.nextUid >= 1 && out.nextUid <= 2 ** 31 ? out.nextUid : d.nextUid;
  for (const it of [...Object.values(out.equip), ...out.inv]) {
    if (!it || typeof it !== "object") continue;
    const raw = it.uid;
    const n = typeof raw === "number" ? raw : (typeof raw === "string" && /^\d{1,10}$/.test(raw) ? Number(raw) : NaN);
    if (Number.isSafeInteger(n) && n >= 1 && n <= 2 ** 31 && !usedUids.has(n)) {
      it.uid = n;
      usedUids.add(n);
      if (n >= nextUid) nextUid = n === 2 ** 31 ? 1 : n + 1;
    } else {
      let candidate = nextUid;
      while (usedUids.has(candidate)) candidate = candidate >= 2 ** 31 ? 1 : candidate + 1;
      it.uid = candidate;
      usedUids.add(candidate);
      nextUid = candidate >= 2 ** 31 ? 1 : candidate + 1;
    }
  }
  out.nextUid = nextUid;
  // 무기 내구도 (예전 무기엔 없던 값 → 가득으로)
  // 칭호: 관리자가 준 것만 (보관함 titles, 장착 title)
  out.titles = (Array.isArray(out.titles) ? out.titles : []).filter((t) => t && Number.isInteger(t.id) && typeof t.text === "string" && t.text.length >= 1 && t.text.length <= TITLE_MAX)
    .map((t) => ({ id: t.id, text: t.text, color: TITLE_COLORS.includes(t.color) ? t.color : TITLE_COLORS[0], at: t.at ?? 0 })).slice(0, 50);
  if (!out.titles.some((t) => t.id === out.title)) out.title = null;
  // 스킬 해금 단계가 바뀌어 아직 못 쓰는 스킬이 장착돼 있으면 빼고, 빈칸은 기본 스킬로 채움
  try {
    const avail = new Set(availableSkills(out).map((x) => x.id));
    const seenSkills = new Set();
    out.skills = out.skills.map((id) => {
      if (!id || !avail.has(id) || SKILLS[id]?.kind === "passive" || seenSkills.has(id)) return null;
      seenSkills.add(id);
      return id;
    });
    const def = out.cls2 ? defaultLoadout2(out) : defaultLoadout(out);
    out.skills.forEach((id, i) => {
      if (!id && def[i] && !out.skills.includes(def[i])) {
        out.skills[i] = def[i];
        seenSkills.add(def[i]);
      }
    });
  } catch {}
  for (const it of out.inv) { ensureAbyss(it); ensureDur(it); upgradeMythic(it); }
  for (const it of Object.values(out.equip)) { ensureAbyss(it); ensureDur(it); upgradeMythic(it); }
  syncMythic(out);
  syncAbyss(out);
  return out;
}

/** 12칸 기본 세트: 기본 공격 + 해금된 액티브/궁극기 최대 9개 + 대시·응급처치 */
export function defaultLoadout(ch) {
  const avail = availableSkills(ch).filter((s) => s.cls === ch.cls && !s.weaponBasic && !s.path);
  const basic = avail.find((s) => s.kind === "basic" && (!s.stance || s.stance === avail.find((b) => b.kind === "basic")?.stance));
  const out = [basic?.id ?? "c_thrust"];
  const taken = new Set(out);
  for (const s of avail) {
    if (out.length >= SKILL_SLOTS - 2) break;
    if (s.kind === "passive" || s.kind === "basic" || taken.has(s.id)) continue;
    if (s.exclusive && taken.has(s.exclusive)) continue;
    out.push(s.id); taken.add(s.id);
  }
  if (out.length < SKILL_SLOTS - 2 && !taken.has("c_slash")) out.push("c_slash");
  while (out.length < SKILL_SLOTS - 2) out.push(null);
  out.push("c_dash", "c_firstaid");
  return out;
}

/** 이 캐릭터가 지금 쓸 수 있는 스킬 (2차 전직 스킬은 경로·등급 레벨이 맞아야) */
export function availableSkills(ch) {
  const stage = stageOf(ch.cls, ch.level);
  const n = CLASS_INFO[ch.cls].ranks.length;
  return Object.values(SKILLS).filter((s) => s.cls === "common" || (s.path ? ch.cls2 === s.path && ch.level >= (TIER_LEVEL[s.tier] ?? 999) : s.cls === ch.cls && stage >= unlockStage(s, n)));
}
/** 2차 전직 기본 세트: 열린 2차 액티브를 우선 배치하고 남은 칸은 1차 액티브로 채운다. */
export function defaultLoadout2(ch) {
  const avail = availableSkills(ch).filter((s) => s.path === ch.cls2);
  const basic = avail.find((s) => s.kind === "basic");
  const out = [basic?.id ?? defaultLoadout(ch)[0]];
  for (const s of avail.sort((a, b) => a.tier - b.tier)) {
    if (out.length >= SKILL_SLOTS - 2) break;
    if (out.includes(s.id) || s.kind === "basic" || s.kind === "passive") continue;
    out.push(s.id);
  }
  const base = defaultLoadout(ch);
  for (const id of base.slice(1, SKILL_SLOTS - 2)) {
    if (out.length >= SKILL_SLOTS - 2) break;
    if (id && !out.includes(id)) out.push(id);
  }
  while (out.length < SKILL_SLOTS - 2) out.push(null);
  out.push("c_dash", "c_firstaid");
  return out;
}

let nextUnitId = 1;
export const newUnitId = () => nextUnitId++;

export function makePlayerUnit(session) {
  const ch = session.char;
  const u = {
    id: newUnitId(), team: "p", type: "p", session, userId: session.userId, name: ch.name,
    x: 0, y: 0, r: PLAYER_RADIUS, facing: 0, dead: false,
    status: new Map(), buffs: new Map(), shield: null,
    cds: new Map(), lockUntil: 0, casting: null, channel: null, dash: null, parry: null,
    inputs: [], lastInput: { mx: 0, my: 0, ax: 0, ay: 0 }, lastSeq: 0, idleSince: 0, missed: 0,
    ki: 0, holy: 0, parts: 0, gap: 0, stance: "검술", stanceShift: false,
    icd: new Map(), devices: [], lastSkill: null, lastSkillAt: 0, acupoint: 0, kiWindow: { t: 0, n: 0 },
    anim: { name: "idle", t: 0, dur: 0 },
  };
  refreshStats(u);
  u.hp = u.maxHp;
  u.mp = u.maxMp;
  return u;
}

export function refreshStats(u) {
  const ch = u.session.char;
  const s = deriveStats(ch);
  u.stats = s;
  u.level = ch.level;
  u.cls = ch.cls;
  const hpRatio = u.maxHp ? u.hp / u.maxHp : 1;
  u.maxHp = s.maxHp;
  u.maxMp = s.maxMp;
  u.def = s.def;
  u.res = s.res;
  if (u.hp != null) u.hp = Math.min(u.maxHp, Math.max(u.dead ? 0 : 1, Math.round(u.maxHp * hpRatio)));
  if (u.mp != null) u.mp = Math.min(u.maxMp, u.mp);
  u.mythicBerserk = s.mythic.includes("berserk");
  u.mythicIron = s.mythic.includes("iron_will");
  u.mythic = new Set(s.mythic);
  u.abyss = new Set(s.abyssEffects ?? []);
}

/** 경험치 획득 → 레벨업 (레벨업마다 스탯 3점) */
export function gainXp(room, u, amount) {
  const ch = u.session.char;
  if (ch.level >= MAX_LEVEL) return;
  ch.xp += Math.round(amount);
  let leveled = false;
  while (ch.level < MAX_LEVEL && ch.xp >= xpToNext(ch.level)) {
    ch.xp -= xpToNext(ch.level);
    ch.level++;
    ch.unspent += STAT_POINTS_PER_LEVEL;
    leveled = true;
    if (ch.cls2) {
      const tier = Object.entries(TIER_LEVEL).find(([, lv]) => lv === ch.level)?.[0];
      if (tier) {
        const sk = Object.values(SKILLS).find((x) => x.path === ch.cls2 && x.tier === Number(tier));
        if (sk) u.session.notice(`${PATHS[ch.cls2].name} ${tier}등급 스킬 [${sk.name}]이(가) 열렸어요! 스킬 창(K)에서 장착하세요.`);
      }
    }
    const prevStage = stageOf(ch.cls, ch.level - 1), stage = stageOf(ch.cls, ch.level);
    if (stage > prevStage) {
      room.ev({ e: "msg", text: `${ch.name}님이 ${CLASS_INFO[ch.cls].ranks[stage]}(으)로 성장했어요!`, kind: "rank" });
      u.session.notice(`성장 단계 상승: ${CLASS_INFO[ch.cls].ranks[stage]} — 새 스킬을 확인해 보세요.`);
    }
  }
  if (leveled) {
    const myth = syncMythic(ch); // 신화 장비도 같이 성장
    const abyss = syncAbyss(ch); // 심연 장비도 같은 레벨로 성장
    refreshStats(u);
    if (myth || abyss) room.world?.sendChar?.(u.session);
    u.hp = u.maxHp;
    u.mp = u.maxMp;
    room.ev({ e: "lvl", id: u.id, l: ch.level });
    u.session.dirty = true;
    if (ch.level >= MAX_LEVEL && !ch.reward250) room.world?.grantReward250?.(u.session);
  }
  u.session.meDirty = true;
}

export function consumableCap(id) {
  return ITEMS[id]?.max ?? 0;
}
