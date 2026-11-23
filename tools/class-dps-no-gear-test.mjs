import assert from "node:assert/strict";
import { makeFloor } from "../server/game/dungeon.js";
import { Room } from "../server/game/room.js";
import { availableSkills, makePlayerUnit, newCharacter } from "../server/game/player.js";
import { castSkill } from "../server/game/skills.js";
import { CLASS_INFO } from "../shared/classes.js";
import { CLASS2_LEVEL, PATHS, pathsFor } from "../shared/classes2.js";
import { MAX_LEVEL, SKILL_SLOTS } from "../shared/constants.js";
import { PROF_TOTAL } from "../shared/prof.js";
import { SKILLS } from "../shared/skills.js";

const POINTS = (MAX_LEVEL - 1) * 3;
const WARMUP = 10;
const TOTAL = 70;
const SAMPLE_SECONDS = TOTAL - WARMUP;
const SEEDS = 3;

const PRIMARY = {
  sword: "str2", fist: "str2", archer: "agi2", rogue: "vital",
  mage: "int2", priest: "faith", smith: "str2",
};
const GRADE_ORDER = { 신화: 0, 전설: 1, 영웅: 2, 희귀: 3, 일반: 4, "2차": 5 };
const BASE_PRIORITY = {
  sword: ["sw_final", "sw_eo_vortex", "sw_eo_bolt", "sw_thrust", "sw_thunder", "sw_fiveslash", "sw_moon", "sw_gale"],
  fist: ["fi_acupoint", "fi_final", "fi_kingblow", "fi_thousand", "fi_meteorkick", "fi_burst", "fi_combo", "fi_jab"],
  archer: ["ar_absolute", "ar_evasion", "ar_final", "ar_storm", "ar_lethal", "ar_double", "ar_shot"],
  rogue: ["ro_hunt", "ro_check", "ro_final", "ro_finale", "ro_open", "ro_cut"],
  mage: ["ma_resonance", "ma_final", "ma_meteor", "ma_blizzard", "ma_chain", "ma_arcane"],
  priest: ["pr_final", "pr_apocalypse", "pr_radiance", "pr_sanctum", "pr_halo", "pr_lightray", "pr_convert", "pr_bolt"],
  smith: ["sm_final", "sm_golem", "sm_overload", "sm_mine", "sm_taunt", "sm_rivetgun", "sm_hammer"],
};

function statBuilds(cls, path) {
  const main = PRIMARY[cls];
  const make = (name, points) => {
    const total = Object.values(points).reduce((a, b) => a + b, 0);
    assert.equal(total, POINTS, `${cls}/${path} ${name}: stat points must sum to ${POINTS}`);
    return { name, points };
  };
  const options = [make("주력 스탯 집중", { [main]: POINTS })];
  if (CLASS_INFO[cls].stats.includes("crit")) {
    options.push(make("치명 180 + 주력 스탯", { crit: 180, [main]: POINTS - 180 }));
  }
  if (cls === "sword") {
    options.push(make("검술 속도 혼합", { swm: 200, str2: POINTS - 200 }));
  }
  if (cls === "archer") {
    options.push(make("정밀 혼합", { prec: 180, agi2: POINTS - 180 }));
  }
  if (cls === "rogue") {
    options.push(make("민첩 집중", { agi3: POINTS }));
  }
  if (cls === "mage") {
    options.push(make("시전 속도 집중", { focus: 80, int2: POINTS - 80 }));
    options.push(make("치명·시전 혼합", { crit: 180, focus: 80, int2: POINTS - 260 }));
  }
  if (cls === "fist" && path === "vajra") {
    options.push(make("방어 전환 혼합", { tough: 300, str2: POINTS - 300 }));
  }
  if (cls === "smith" && path === "mechanic") {
    options.push(make("장치 공학 집중", { eng: 300, str2: POINTS - 300 }));
    options.push(make("공학 집중", { eng: POINTS }));
  }
  return options.filter((build) => Object.keys(build.points).every((key) => CLASS_INFO[cls].stats.includes(key)));
}

function makeLoadout(ch) {
  const available = availableSkills(ch).filter((sk) => sk.kind !== "passive");
  const pathSkills = available
    .filter((sk) => sk.path === ch.cls2)
    .sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
  const pathBasic = pathSkills.find((sk) => sk.kind === "basic");
  const baseSkills = available.filter((sk) => sk.cls === ch.cls && !sk.path);
  const baseBasic = baseSkills.find((sk) => sk.kind === "basic");
  const basic = pathBasic ?? baseBasic;

  const pathActive = pathSkills.filter((sk) => sk !== pathBasic && sk.kind !== "basic");
  const baseMap = new Map(baseSkills
    .filter((sk) => sk.kind !== "basic" && sk.kind !== "passive")
    .map((sk) => [sk.id, sk]));
  const basePrioritized = (BASE_PRIORITY[ch.cls] ?? []).map((id) => baseMap.get(id)).filter(Boolean);
  const baseOther = [...baseMap.values()]
    .filter((sk) => !basePrioritized.some((x) => x.id === sk.id))
    .sort((a, b) => (GRADE_ORDER[a.grade] ?? 9) - (GRADE_ORDER[b.grade] ?? 9));

  const ordered = [];
  const add = (id) => { if (id && !ordered.includes(id) && ordered.length < SKILL_SLOTS) ordered.push(id); };
  add(basic?.id);
  for (const sk of pathActive) add(sk.id);
  for (const sk of basePrioritized) add(sk.id);
  for (const sk of baseOther) add(sk.id);
  while (ordered.length < SKILL_SLOTS) ordered.push(null);

  let priority = [];
  if (ch.cls2 === "swordmaster") priority.push("sg_ilseom", "sg_whirl", "sg_rush");
  priority.push(...pathActive.map((sk) => sk.id));
  priority.push(...basePrioritized.map((sk) => sk.id));
  priority.push(...baseOther.map((sk) => sk.id));
  if (basic) priority.push(basic.id);
  priority = [...new Set(priority)].filter((id) => ordered.includes(id));
  return { skills: ordered, priority };
}

function seededRandom(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

function simulate(cls, path, statBuild, seed) {
  const oldRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    const ch = newCharacter("NoGearDpsBench");
    ch.cls = cls;
    ch.cls2 = path;
    ch.level = MAX_LEVEL;
    ch.stats = { ...statBuild.points };
    ch.unspent = 0;
    ch.equip = { weapon: null, offhand: null, helmet: null, armor: null, trinket: null };

    const loadout = makeLoadout(ch);
    ch.skills = loadout.skills;
    const unlocked = availableSkills(ch);
    ch.prof = Object.fromEntries(unlocked.map((sk) => [sk.id, PROF_TOTAL]));

    const session = {
      userId: 800000 + seed,
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

    const map = makeFloor(1, 91000 + seed, 1, 1);
    map.tiles.fill(1);
    map.spawns = [];
    map.waves = null;
    map.objects = [];
    map.traps = [];
    map.kind = "normal";

    const world = { clock: 0 };
    const room = new Room(world, { id: `no-gear-${cls}-${path}`, kind: "dungeon", floor: 1, map });
    room.addPlayer(player, map.start);
    const homeX = player.x;
    const homeY = player.y;
    const dummy = room.spawnDummy(homeX + 36, homeY);
    dummy.facing = 0;
    dummy.hp = dummy.maxHp = 1e15;

    const slotOf = new Map(ch.skills.map((id, slot) => [id, slot]));
    let damage = 0;
    let casts = 0;

    for (let i = 1; i <= Math.round(TOTAL / 0.05); i++) {
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
          if (slot == null || !sk || sk.kind === "passive") continue;
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
      cls, path, statBuild: statBuild.name,
      dps: damage / SAMPLE_SECONDS,
      atk: player.stats.atk, phys: player.stats.phys, mag: player.stats.mag,
      crit: player.stats.crit, critDmg: player.stats.critDmg,
      aspd: player.stats.aspd, cast: player.stats.cast,
      classDmg: player.stats.classDmg, casts,
    };
  } finally {
    Math.random = oldRandom;
  }
}

const results = [];
let idx = 0;
for (const cls of Object.keys(PRIMARY)) {
  for (const path of pathsFor(cls)) {
    assert.equal(PATHS[path].base, cls);
    assert.ok(MAX_LEVEL >= CLASS2_LEVEL);
    for (const stats of statBuilds(cls, path)) {
      const runs = [];
      for (let seed = 0; seed < SEEDS; seed++) {
        runs.push(simulate(cls, path, stats, 20261123 + idx * 1009 + seed * 7919));
      }
      const mean = runs.reduce((sum, r) => sum + r.dps, 0) / runs.length;
      const sample = runs[0];
      results.push({
        cls, path, pathName: PATHS[path].name, statBuild: stats.name,
        dps: mean, atk: sample.atk, phys: sample.phys, mag: sample.mag,
        crit: sample.crit, aspd: sample.aspd, cast: sample.cast,
        classDmg: sample.classDmg, casts: Math.round(runs.reduce((sum, r) => sum + r.casts, 0) / runs.length),
      });
      idx++;
    }
  }
}

const bestByClass = Object.keys(PRIMARY).map((cls) =>
  results.filter((r) => r.cls === cls).sort((a, b) => b.dps - a.dps)[0]);
bestByClass.sort((a, b) => b.dps - a.dps);
const pathRows = results.map((r) => ({
  cls: r.cls, path: r.path, pathName: r.pathName, statBuild: r.statBuild,
  dps: Math.round(r.dps),
}));
const tableRows = bestByClass.map((r) => ({
  cls: r.cls, path: r.path, pathName: r.pathName, statBuild: r.statBuild,
  dps: Math.round(r.dps), atk: Math.round(r.atk),
  crit: +(r.crit * 100).toFixed(1), aspd: +r.aspd.toFixed(2), cast: +r.cast.toFixed(2),
  phys: +r.phys.toFixed(2), mag: +r.mag.toFixed(2), classDmg: r.classDmg, casts: r.casts,
}));

console.log("NO_GEAR_PATH_RESULTS=" + JSON.stringify(pathRows));
console.log("NO_GEAR_DPS_TABLE=" + JSON.stringify(tableRows));
console.log("순위 | 직업 | 2차 전직 | 스탯 배분 | DPS | 공격력 | 치명타 | 공격 속도 | 시전 속도");
for (let i = 0; i < bestByClass.length; i++) {
  const r = bestByClass[i];
  console.log(`${i + 1} | ${CLASS_INFO[r.cls].name} | ${r.pathName} | ${r.statBuild} | ${Math.round(r.dps).toLocaleString("ko-KR")} | ${Math.round(r.atk).toLocaleString("ko-KR")} | ${(r.crit * 100).toFixed(1)}% | ×${r.aspd.toFixed(2)} | ×${r.cast.toFixed(2)}`);
}
assert.equal(bestByClass.length, 7);
for (const r of bestByClass) assert.ok(Number.isFinite(r.dps) && r.dps > 0);
console.log("NO-GEAR DPS TESTS: ALL PASS");
