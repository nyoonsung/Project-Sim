// 캐릭터 데이터(저장용)와 플레이어 유닛(접속 중)
import { deriveStats } from "../../shared/stats.js";
import { CLASS_INFO, xpToNext, stageOf } from "../../shared/classes.js";
import { SKILLS, unlockStage, adventurerBasic } from "../../shared/skills.js";
import { MAX_LEVEL, STAT_POINTS_PER_LEVEL, PLAYER_RADIUS, ITEMS, TITLE_COLORS, TITLE_MAX } from "../../shared/constants.js";
import { starterGear, ensureDur, upgradeMythic, syncMythic, ensureAbyss, syncAbyss } from "../../shared/items.js";

export const INV_SIZE = 40;

export function newCharacter(name) {
  const g = starterGear();
  return {
    v: 1, name, level: 1, xp: 0, cls: "adventurer", stats: {}, unspent: 0, prof: {}, titles: [], title: null,
    skills: ["c_thrust", "c_slash", null, null, null, null, "c_dash", "c_firstaid"],
    equip: { weapon: { uid: 1, ...g.weapon }, offhand: { uid: 2, ...g.offhand }, helmet: null, armor: null, trinket: null },
    inv: [], nextUid: 3, cons: { hp_potion: 5, antidote: 2, mp_potion: 2 }, gold: 100,
    best: 0, checkpoint: 1, cleared: false,
    best2: 0, checkpoint2: 1, cleared2: false, abyssKeys: 0, riftCrystals: 0,
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
  out.abyssKeys = Math.max(0, Math.min(9999, Number.isFinite(out.abyssKeys) ? out.abyssKeys | 0 : 0));
  out.riftCrystals = Math.max(0, Math.min(999999, Number.isFinite(out.riftCrystals) ? out.riftCrystals | 0 : 0));
  if (!Array.isArray(out.skills) || out.skills.length !== 8) out.skills = d.skills;
  if (!Array.isArray(out.inv)) out.inv = [];
  out.cons = { ...d.cons, ...(out.cons ?? {}) };
  // 스킬 숙련도: { 스킬id: 경험치 } (알 수 없는 스킬·잘못된 값 제거)
  const prof = {};
  if (out.prof && typeof out.prof === "object") for (const [k, v] of Object.entries(out.prof)) if (SKILLS[k] && Number.isFinite(v) && v > 0) prof[k] = Math.min(Math.floor(v), 1e7);
  out.prof = prof;
  // 모험가 기본 공격은 든 무기에 맞춤 (활 → 활쏘기, 지팡이 → 마력탄)
  if (out.cls === "adventurer" && Array.isArray(out.skills)) out.skills[0] = adventurerBasic(out.equip?.weapon?.type);
  out.equip = { ...d.equip, ...(out.equip ?? {}) };
  // 무기 내구도 (예전 무기엔 없던 값 → 가득으로)
  // 칭호: 관리자가 준 것만 (보관함 titles, 장착 title)
  out.titles = (Array.isArray(out.titles) ? out.titles : []).filter((t) => t && Number.isInteger(t.id) && typeof t.text === "string" && t.text.length >= 1 && t.text.length <= TITLE_MAX)
    .map((t) => ({ id: t.id, text: t.text, color: TITLE_COLORS.includes(t.color) ? t.color : TITLE_COLORS[0], at: t.at ?? 0 })).slice(0, 50);
  if (!out.titles.some((t) => t.id === out.title)) out.title = null;
  // 스킬 해금 단계가 바뀌어 아직 못 쓰는 스킬이 장착돼 있으면 빼고, 빈칸은 기본 스킬로 채움
  try {
    const avail = new Set(availableSkills(out).map((x) => x.id));
    out.skills = out.skills.map((id) => (id && avail.has(id) ? id : null));
    const def = defaultLoadout(out);
    out.skills.forEach((id, i) => { if (!id && def[i] && !out.skills.includes(def[i])) out.skills[i] = def[i]; });
  } catch {}
  for (const it of out.inv) { ensureAbyss(it); ensureDur(it); upgradeMythic(it); }
  for (const it of Object.values(out.equip)) { ensureAbyss(it); ensureDur(it); upgradeMythic(it); }
  syncMythic(out);
  syncAbyss(out);
  return out;
}

/** 직업 기본 스킬 세트: 1번 기본 공격, 2~6번 지금 레벨에 쓸 수 있는 직업 스킬(정의 순서), 7번 대시, 8번 응급처치 */
export function defaultLoadout(ch) {
  const avail = availableSkills(ch).filter((s) => s.cls === ch.cls && !s.weaponBasic);
  const basic = avail.find((s) => s.kind === "basic" && (!s.stance || s.stance === avail.find((b) => b.kind === "basic")?.stance));
  const out = [basic?.id ?? "c_thrust"];
  const taken = new Set(out);
  for (const s of avail) {
    if (out.length >= 6) break;
    if (s.kind === "passive" || s.kind === "basic" || s.kind === "ultimate" || taken.has(s.id)) continue;
    if (s.exclusive && taken.has(s.exclusive)) continue;
    out.push(s.id); taken.add(s.id);
  }
  // 직업 스킬이 모자라면 공용 베기로 채움
  if (out.length < 6 && !taken.has("c_slash")) out.push("c_slash");
  while (out.length < 6) out.push(null);
  out.push("c_dash", "c_firstaid");
  return out;
}

/** 이 캐릭터가 지금 쓸 수 있는 스킬 */
export function availableSkills(ch) {
  const stage = stageOf(ch.cls, ch.level);
  const n = CLASS_INFO[ch.cls].ranks.length;
  return Object.values(SKILLS).filter((s) => s.cls === "common" || (s.cls === ch.cls && stage >= unlockStage(s, n)));
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
  }
  u.session.meDirty = true;
}

export function consumableCap(id) {
  return ITEMS[id]?.max ?? 0;
}
