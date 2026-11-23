import assert from "node:assert/strict";
import { makeFloor } from "../server/game/dungeon.js";
import { Room } from "../server/game/room.js";
import {
  availableSkills, defaultLoadout2, makePlayerUnit, newCharacter, refreshStats,
} from "../server/game/player.js";
import { castSkill } from "../server/game/skills.js";
import { CLASS_INFO } from "../shared/classes.js";
import { PATHS, pathsFor } from "../shared/classes2.js";
import { MAX_LEVEL, SKILL_SLOTS } from "../shared/constants.js";
import { CLASS_GEAR, MAX_ENH, baseStats, optionMax } from "../shared/items.js";
import { PROF_TOTAL } from "../shared/prof.js";
import { SKILLS } from "../shared/skills.js";
import { makeMaxAbyssBundle } from "../server/gm-items.js";

const POINTS = (MAX_LEVEL - 1) * 3;
const WARMUP = 10;
const TOTAL = 75;
const SAMPLE_SECONDS = TOTAL - WARMUP;
const SEEDS = 3;

// 5가지 공격 옵션을 전 부위에 최대 롤(+최대 허용치의 3배)로 적용.
const MAX_OFFENSE_OPTIONS = ["atk", "atkPct", "crit", "dmg", "aspd"];
const BUNDLE = makeMaxAbyssBundle();

function pickItem(predicate, label) {
  const item = BUNDLE.find(predicate);
  assert.ok(item, `심연 장비 누락: ${label}`);
  return structuredClone(item);
}

function tuned(item) {
  item.enh = MAX_ENH;
  item.ench = "dmg";
  item.opts = MAX_OFFENSE_OPTIONS.map((k) => ({
    k,
    v: +(optionMax(k, MAX_LEVEL, 5) * 3).toFixed(3),
  }));
  item.dur = item.maxDur;
  assert.equal(item.rarity, "심연");
  assert.equal(item.ilvl, MAX_LEVEL);
  assert.equal(item.enh, 99);
  assert.equal(item.opts.length, 5);
  return item;
}

function offensiveGear(cls) {
  const classWeapon = pickItem((it) => it.classRelic === cls, cls + " 직업 전용 무기");
  const gear = CLASS_GEAR[cls];
  let offhand;
  if (["sword", "fist", "smith"].includes(cls)) {
    offhand = pickItem((it) => it.relic === "null-aegis", "무효의 방벽");
    offhand.type = "shield";
    offhand.base = baseStats("offhand", "shield", MAX_LEVEL, 5, 0);
    offhand.base.def += 66;
    offhand.base.hp += 360;
    offhand.base.dr = (offhand.base.dr ?? 0) + 0.084;
  } else {
    offhand = pickItem((it) => it.slot === "offhand" && it.type === gear.o[0] && !it.relic, cls + " 보조장비");
  }

  const helmet = pickItem((it) => it.relic === "eclipse-visor", "일식의 면갑");
  helmet.variant = 2;
  helmet.base = baseStats("helmet", undefined, MAX_LEVEL, 5, 2);
  helmet.base.critDmg = (helmet.base.critDmg ?? 0) + 0.156;

  const armor = pickItem((it) => it.relic === "chrono-mantle", "무음의 망토");
  armor.variant = 2;
  armor.base = baseStats("armor", undefined, MAX_LEVEL, 5, 2);
  armor.base.def += 81.6;
  armor.base.hp += 432;
  armor.base.move = (armor.base.move ?? 0) + 0.06;
  armor.base.dr = (armor.base.dr ?? 0) + 0.072;

  const trinket = pickItem((it) => it.relic === "star-heart", "심연의 인장");
  trinket.variant = 0;
  trinket.base = baseStats("trinket", undefined, MAX_LEVEL, 5, 0);
  trinket.base.hp += 288;
  trinket.base.mp += 192;
  trinket.base.atkPct += 0.12;
  trinket.base.crit = (trinket.base.crit ?? 0) + 0.048;

  return {
    weapon: tuned(classWeapon),
    offhand: tuned(offhand),
    helmet: tuned(helmet),
    armor: tuned(armor),
    trinket: tuned(trinket),
  };
}

const PRIMARY_STATS = {
  sword: "str2",
  fist: "str2",
  archer: "agi2",
  rogue: "agi3",
  mage: "int2",
  priest: "faith",
  smith: "str2",
};

function statBuilds(cls, path) {
  const primary = { name: "주력 공격 스탯", stats: { [PRIMARY_STATS[cls]]: POINTS } };
  const builds = [primary];

  // 공격 스탯 외의 직업 전용 공격 보조 능력치가 DPS를 더 높이는지 함께 비교.
  if (cls === "archer") builds.push({ name: "정밀 집중", stats: { prec: POINTS } });
  if (cls === "rogue") builds.push({ name: "급소 집중", stats: { vital: POINTS } });
  if (cls === "mage") builds.push({ name: "시전 혼합", stats: { int2: POINTS - 80, focus: 80 } });
  if (cls === "fist" && path === "vajra") builds.push({ name: "방어 전환", stats: { tough: POINTS } });
  if (cls === "smith" && path === "mechanic") builds.push({ name: "공학 집중", stats: { eng: POINTS } });
  if (cls === "smith" && path === "volcano") builds.push({ name: "내구 집중", stats: { dura: POINTS } });

  return builds;
}

const BASE_PRIORITY = {
  sword: ["sw_final", "sw_eo_vortex", "sw_eo_bolt", "sw_thrust", "sw_thunder", "sw_fiveslash", "sw_moon", "sw_gale"],
  fist: ["fi_acupoint", "fi_final", "fi_kingblow", "fi_thousand", "fi_meteorkick", "fi_burst", "fi_combo", "fi_jab"],
  archer: ["ar_absolute", "ar_evasion", "ar_final", "ar_storm", "ar_lethal", "ar_double", "ar_shot"],
  rogue: ["ro_hunt", "ro_check", "ro_final", "ro_finale", "ro_open", "ro_cut"],
  mage: ["ma_resonance", "ma_final", "ma_meteor", "ma_blizzard", "ma_chain", "ma_arcane"],
  priest: ["pr_final", "pr_apocalypse", "pr_radiance", "pr_sanctum", "pr_halo", "pr_lightray", "pr_convert", "pr_bolt"],
  smith: ["sm_final", "sm_golem", "sm_overload", "sm_mine", "sm_taunt", "sm_rivetgun", "sm_hammer"],
};

const GRADE_ORDER = { 신화: 0, 전설: 1, 영웅: 2, 희귀: 3, 일반: 4, "2차": 5 };

function skillValue(sk) {
  let value = 0;
  for (const st of sk.steps ?? []) {
    const pow = st.pow ?? st.hit?.pow ?? st.finish ?? 0;
    const hits = st.hits ?? st.count ?? st.ticks ?? 1;
    value += pow * hits;
  }
  return value / Math.max(1, sk.cd ?? (sk.kind === "basic" ? 1 : 3));
}

function loadoutFor(ch) {
  const available = availableSkills(ch).filter((s) => s.kind !== "passive");
  const pathSkills = available
    .filter((s) => s.path === ch.cls2)
    .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
  const pathBasic = pathSkills.find((s) => s.kind === "basic");
  const baseBasic = available.find((s) => s.cls === ch.cls && !s.path && s.kind === "basic");
  const basic = pathBasic ?? baseBasic;
  const pathActive = pathSkills.filter((s) => s !== pathBasic && s.kind !== "basic");
  const baseMap = new Map(available
    .filter((s) => s.cls === ch.cls && !s.path && s.kind !== "basic")
    .map((s) => [s.id, s]));
  const basePriority = (BASE_PRIORITY[ch.cls] ?? []).map((id) => baseMap.get(id)).filter(Boolean);
  const baseExtra = [...baseMap.values()]
    .filter((s) => !basePriority.some((p) => p.id === s.id))
    .sort((a, b) => (GRADE_ORDER[a.grade] ?? 9) - (GRADE_ORDER[b.grade] ?? 9)
      || skillValue(b) - skillValue(a));

  const orderedPath = [...pathActive];
  const ids = [];
  const add = (id) => { if (id && !ids.includes(id) && ids.length < SKILL_SLOTS) ids.push(id); };

  add(basic?.id);
  for (const sk of orderedPath) add(sk.id);
  for (const sk of basePriority) add(sk.id);
  for (const sk of baseExtra) add(sk.id);
  while (ids.length < SKILL_SLOTS) ids.push(null);

  let priority = [];
  if (ch.cls2 === "swordmaster") priority.push("sg_ilseom", "sg_whirl", "sg_rush");
  priority.push(...orderedPath.map((s) => s.id));
  priority.push(...basePriority.map((s) => s.id));
  priority.push(...baseExtra.map((s) => s.id));
  if (basic) priority.push(basic.id);
  priority = [...new Set(priority)].filter((id) => ids.includes(id));

  return { skills: ids, priority };
}

function seededRandom(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

function simulate(cls, path, statBuild, gear, seed) {
  const oldRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    const ch = newCharacter("MaxAbyssBench");
    ch.cls = cls;
    ch.cls2 = path;
    ch.level = MAX_LEVEL;
    ch.cleared = true;
    ch.stats = { ...statBuild.stats };
    ch.unspent = 0;
    ch.equip = structuredClone(gear);

    const loadout = loadoutFor(ch);
    ch.skills = loadout.skills;
    ch.prof = Object.fromEntries(ch.skills.filter(Boolean).map((id) => [id, PROF_TOTAL]));

    const session = {
      userId: 700000 + seed,
      char: ch,
      send() {},
      notice() {},
      sendMe() {},
      meDirty: false,
      dirty: false,
    };
    const player = makePlayerUnit(session);
    player.ki = 100;
    player.holy = 100;
    player.parts = 3;
    player.gap = 3;
    player.r2 = 100;

    const map = makeFloor(1, 81000 + seed, 1, 1);
    map.tiles.fill(1);
    map.spawns = [];
    map.waves = null;
    map.objects = [];
    map.traps = [];
    map.kind = "normal";

    const world = { clock: 0 };
    const room = new Room({ pickup() {}, onBossCleared() {}, usePortal() {}, partyFailed() {}, toTown() {} },
      { id: `max-abyss-${cls}-${path}`, kind: "dungeon", floor: 1, map });
    room.addPlayer(player, map.start);
    const homeX = map.start[0];
    const homeY = map.start[1];
    player.x = homeX;
    player.y = homeY;

    const dummy = room.spawnDummy(homeX + 36, homeY);
    dummy.facing = 0;
    dummy.hp = dummy.maxHp = 1e15;

    const slotOf = new Map(ch.skills.map((id, slot) => [id, slot]));
    let damage = 0;
    let casts = 0;
    const ticks = Math.round(TOTAL / 0.05);

    for (let i = 1; i <= ticks; i++) {
      const now = +(i * 0.05).toFixed(4);
      world.clock = now;
      room.tick();

      if (!player.dash && Math.hypot(player.x - homeX, player.y - homeY) > 2) {
        player.x = homeX;
        player.y = homeY;
      }

      if (now >= WARMUP && !player.dead && !player.casting && !player.channel && !player.dash) {
        for (const id of loadout.priority) {
          const slot = slotOf.get(id);
          const sk = SKILLS[id];
          if (slot == null || !sk || sk.kind === "passive" || sk.kind === "basic" && now > TOTAL) continue;
          const readyAt = Math.max(
            sk.noGcd ? 0 : player.lockUntil,
            player.cds.get(id) ?? 0,
            sk.moveSkill ? player.moveLock ?? 0 : 0,
          );
          if (now + 1e-7 < readyAt) continue;
          castSkill(room, player, slot, dummy.x, dummy.y, null, now, now + 0.5);
          casts++;
          break;
        }
      }

      for (const ev of room.events.splice(0)) {
        if (ev.e === "dmg" && ev.id === dummy.id && now >= WARMUP) damage += ev.v;
      }
    }

    return {
      cls,
      path,
      statBuild: statBuild.name,
      dps: damage / SAMPLE_SECONDS,
      atk: player.stats.atk,
      crit: player.stats.crit,
      critDmg: player.stats.critDmg,
      aspd: player.stats.aspd,
      dmg: player.stats.dmg,
      classDmg: player.stats.classDmg,
      casts,
      skills: ch.skills.filter(Boolean),
    };
  } finally {
    Math.random = oldRandom;
  }
}

function round(value) {
  return Math.round(value);
}

const gearByClass = Object.fromEntries(Object.keys(PRIMARY_STATS).map((cls) => [cls, offensiveGear(cls)]));
const results = [];
let pathIndex = 0;

for (const cls of Object.keys(PRIMARY_STATS)) {
  for (const path of pathsFor(cls)) {
    const statOptions = statBuilds(cls, path);
    for (const statBuild of statOptions) {
      const runs = [];
      for (let i = 0; i < SEEDS; i++) {
        runs.push(simulate(cls, path, statBuild, gearByClass[cls], 20261123 + pathIndex * 1009 + i * 7919));
      }
      const mean = runs.reduce((sum, r) => sum + r.dps, 0) / runs.length;
      const sample = runs[0];
      results.push({
        cls, path, pathName: PATHS[path].name, statBuild: statBuild.name,
        dps: mean, atk: sample.atk, crit: sample.crit, critDmg: sample.critDmg,
        aspd: sample.aspd, dmg: sample.dmg, classDmg: sample.classDmg,
        casts: round(runs.reduce((sum, r) => sum + r.casts, 0) / runs.length),
      });
    }
    pathIndex++;
  }
}

const bestByClass = Object.keys(PRIMARY_STATS).map((cls) =>
  results.filter((r) => r.cls === cls).sort((a, b) => b.dps - a.dps)[0]);
bestByClass.sort((a, b) => b.dps - a.dps);

console.log("MAX_ABYSS_DPS_PATH_RESULTS=" + JSON.stringify(results.map((r) => ({
  cls: r.cls, path: r.path, pathName: r.pathName, statBuild: r.statBuild, dps: round(r.dps),
}))));
console.log("MAX_ABYSS_DPS_TABLE_JSON=" + JSON.stringify(bestByClass.map((r) => ({
  cls: r.cls, path: r.path, pathName: r.pathName, statBuild: r.statBuild,
  dps: round(r.dps), atk: round(r.atk), crit: +(r.crit * 100).toFixed(1),
  critDmg: +(r.critDmg * 100).toFixed(1), aspd: +r.aspd.toFixed(2),
  dmg: +(r.dmg * 100).toFixed(1), classDmg: r.classDmg, casts: r.casts,
}))));
console.log("순위 | 직업 | 2차 전직 | DPS | 공격력 | 치명타 | 치명타 피해 | 공격속도");
for (let i = 0; i < bestByClass.length; i++) {
  const r = bestByClass[i];
  console.log(`${i + 1} | ${CLASS_INFO[r.cls].name} | ${r.pathName} | ${round(r.dps).toLocaleString("ko-KR")} | ${round(r.atk).toLocaleString("ko-KR")} | ${(r.crit * 100).toFixed(1)}% | ${(r.critDmg * 100).toFixed(1)}% | ×${r.aspd.toFixed(2)}`);
}

assert.equal(bestByClass.length, 7);
for (const r of bestByClass) {
  assert.ok(Number.isFinite(r.dps) && r.dps > 0, `${r.cls} max Abyss DPS must be measurable`);
}
console.log("MAX ABYSS DPS TESTS: ALL PASS");
