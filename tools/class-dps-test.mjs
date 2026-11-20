import assert from "node:assert/strict";
import { CLASS_GEAR, makeItem } from "../shared/items.js";
import { CLASS_INFO } from "../shared/classes.js";
import { deriveStats } from "../shared/stats.js";
import { SKILLS } from "../shared/skills.js";
import { PROF_TOTAL } from "../shared/prof.js";
import { makeFloor } from "../server/game/dungeon.js";
import { Room } from "../server/game/room.js";
import { newCharacter, makePlayerUnit } from "../server/game/player.js";
import { castSkill } from "../server/game/skills.js";

const TICK = 0.05;
const WARMUP = 8;
const TOTAL = 68;
const SAMPLE_SECONDS = TOTAL - WARMUP;
const CRIT_POINTS = 180;
const DAMAGE_POINTS = 447 - CRIT_POINTS;


// 기본 체력 배율: 검사·도적·마법사 소폭 상향. 방어 배율은 그대로 유지한다.
{
  const expected = {
    sword: { hpMul: 1.24, defMul: 1.1, hpAtLv10: 422 },
    rogue: { hpMul: 0.88, defMul: 0.85, hpAtLv10: 299 },
    mage: { hpMul: 1.03, defMul: 0.9, hpAtLv10: 350 },
  };
  for (const [cls, exp] of Object.entries(expected)) {
    assert.equal(CLASS_INFO[cls].hpMul, exp.hpMul, `${cls}: base HP multiplier`);
    assert.equal(CLASS_INFO[cls].defMul, exp.defMul, `${cls}: defense multiplier unchanged`);
    const s = deriveStats({ cls, level: 10, stats: {}, equip: {}, skills: [] });
    assert.equal(s.maxHp, exp.hpAtLv10, `${cls}: level 10 base HP`);
  }
}
console.log("✓ 검사·도적·마법사 기본 HP 상향 / 방어 배율 유지");

const BUILDS = [
  {
    cls: "sword", stats: { str2: DAMAGE_POINTS, crit: CRIT_POINTS },
    skills: ["sw_gale", "sw_thrust", "sw_fiveslash", "sw_thunder", "sw_eo_vortex", "sw_eo_bolt", "sw_final", "sw_moon"],
    priority: ["sw_final", "sw_eo_vortex", "sw_eo_bolt", "sw_thrust", "sw_thunder", "sw_fiveslash", "sw_moon", "sw_gale"],
  },
  {
    cls: "fist", stats: { str2: DAMAGE_POINTS, crit: CRIT_POINTS },
    skills: ["fi_jab", "fi_acupoint", "fi_burst", "fi_combo", "fi_thousand", "fi_kingblow", "fi_final", "fi_meteorkick"],
    priority: ["fi_acupoint", "fi_final", "fi_kingblow", "fi_thousand", "fi_meteorkick", "fi_burst", "fi_combo", "fi_jab"],
  },
  {
    cls: "archer", stats: { agi2: DAMAGE_POINTS, crit: CRIT_POINTS },
    skills: ["ar_shot", "ar_mastery", "ar_double", "ar_lethal", "ar_evasion", "ar_absolute", "ar_final", "ar_storm"],
    priority: ["ar_absolute", "ar_evasion", "ar_final", "ar_storm", "ar_lethal", "ar_double", "ar_shot"],
  },
  {
    cls: "rogue", stats: { vital: DAMAGE_POINTS, crit: CRIT_POINTS },
    skills: ["ro_cut", "ro_footwork", "ro_track", "ro_hunt", "ro_check", "ro_open", "ro_finale", "ro_final"],
    priority: ["ro_hunt", "ro_check", "ro_final", "ro_finale", "ro_open", "ro_cut"],
  },
  {
    cls: "mage", stats: { int2: DAMAGE_POINTS, crit: CRIT_POINTS },
    skills: ["ma_arcane", "ma_precise", "ma_echo", "ma_chain", "ma_meteor", "ma_blizzard", "ma_resonance", "ma_final"],
    priority: ["ma_resonance", "ma_final", "ma_meteor", "ma_blizzard", "ma_chain", "ma_arcane"],
  },
  {
    cls: "priest", stats: { faith: DAMAGE_POINTS, crit: CRIT_POINTS },
    skills: ["pr_bolt", "pr_convert", "pr_lightray", "pr_halo", "pr_sanctum", "pr_radiance", "pr_apocalypse", "pr_final"],
    priority: ["pr_final", "pr_apocalypse", "pr_radiance", "pr_sanctum", "pr_halo", "pr_lightray", "pr_convert", "pr_bolt"],
  },
  {
    cls: "smith", stats: { str2: DAMAGE_POINTS, crit: CRIT_POINTS },
    skills: ["sm_hammer", "sm_armor", "sm_rivetgun", "sm_overload", "sm_mine", "sm_taunt", "sm_golem", "sm_final"],
    priority: ["sm_final", "sm_golem", "sm_overload", "sm_mine", "sm_taunt", "sm_rivetgun", "sm_hammer"],
  },
];

function gearFor(cls) {
  const g = CLASS_GEAR[cls];
  return {
    weapon: makeItem({ slot: "weapon", type: g.w[0], rarity: "전설", ilvl: 100, ench: "dmg" }),
    offhand: makeItem({ slot: "offhand", type: g.o[0], rarity: "전설", ilvl: 100, ench: "dmg" }),
    helmet: makeItem({ slot: "helmet", variant: 0, rarity: "전설", ilvl: 100, ench: "dmg" }),
    armor: makeItem({ slot: "armor", variant: 0, rarity: "전설", ilvl: 100, ench: "dmg" }),
    trinket: makeItem({ slot: "trinket", variant: 0, rarity: "전설", ilvl: 100, ench: "dmg" }),
  };
}

function seededRandom(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 0x100000000;
  };
}

function canAfford(player, skill, id) {
  const plv = player.session.char.prof?.[id] ? 10 : 0;
  for (const [key, base] of Object.entries(skill.cost ?? {})) {
    const cost = key === "mp" && plv ? Math.round(base * 0.85 * 10) / 10 : base;
    if ((player[key] ?? 0) + 1e-7 < cost) return false;
  }
  return true;
}

function simulate(build, index) {
  const random = seededRandom(20261120 + index * 9973);
  Math.random = random;

  const char = newCharacter(`Bench-${build.cls}`);
  char.cls = build.cls;
  char.level = 150;
  char.stats = { ...build.stats };
  char.unspent = 0;
  char.skills = [...build.skills];
  char.prof = Object.fromEntries(build.skills.map((id) => [id, PROF_TOTAL]));
  char.equip = gearFor(build.cls);
  assert.ok(Object.values(char.equip).every(Boolean), `${build.cls}: all benchmark gear created`);
  assert.ok(build.skills.every((id) => SKILLS[id]?.cls === build.cls), `${build.cls}: invalid skill loadout`);
  assert.ok(CLASS_INFO[build.cls], `${build.cls}: missing class data`);

  const session = {
    userId: 9000 + index,
    char,
    send() {},
    notice() {},
    meDirty: false,
    dirty: false,
  };
  const player = makePlayerUnit(session);
  player.ki = 100;
  player.holy = 100;
  player.parts = 3;
  player.gap = 3;

  const map = makeFloor(1, 5000 + index, 1, 1);
  map.tiles.fill(1);
  map.spawns = [];
  map.waves = null;
  map.objects = [];
  map.traps = [];
  map.kind = "normal";

  const world = { clock: 0 };
  const room = new Room(world, { id: `dps-${build.cls}`, kind: "dungeon", floor: 1, map });
  room.addPlayer(player, map.start);
  const homeX = map.start[0];
  const homeY = map.start[1];
  player.x = homeX;
  player.y = homeY;
  const dummy = room.spawnDummy(homeX + 36, homeY);
  dummy.facing = 0; // player attacks from behind: same flank setup for every class

  let damage = 0;
  let casts = 0;
  const slotOf = new Map(char.skills.map((id, slot) => [id, slot]));
  const ticks = Math.round(TOTAL / TICK);

  for (let i = 1; i <= ticks; i++) {
    const now = +(i * TICK).toFixed(4);
    world.clock = now;
    room.tick();

    // Dash/teleport attacks are allowed to hit, then the dummy test returns the
    // character to its original standing point so each job can keep attacking.
    if (!player.dash && Math.hypot(player.x - homeX, player.y - homeY) > 2) {
      player.x = homeX;
      player.y = homeY;
    }

    if (now >= WARMUP && now <= TOTAL && !player.dead && !player.casting && !player.channel && !player.dash) {
      for (const id of build.priority) {
        const slot = slotOf.get(id);
        const skill = SKILLS[id];
        if (slot == null || !skill || skill.kind === "passive") continue;
        const readyAt = Math.max(
          skill.noGcd ? 0 : player.lockUntil,
          player.cds.get(id) ?? 0,
          skill.moveSkill ? player.moveLock ?? 0 : 0,
        );
        if (now + 1e-7 < readyAt || !canAfford(player, skill, id)) continue;
        castSkill(room, player, slot, dummy.x, dummy.y, null, now, now + 0.5);
        casts++;
        break;
      }
    }

    for (const ev of room.events.splice(0)) {
      if (ev.e === "dmg" && ev.id === dummy.id && now >= WARMUP) damage += ev.v;
    }
  }

  const dps = damage / SAMPLE_SECONDS;
  return {
    cls: build.cls,
    name: CLASS_INFO[build.cls].name,
    damage: Math.round(damage),
    seconds: SAMPLE_SECONDS,
    dps: Math.round(dps),
    casts,
    atk: Math.round(player.stats.atk),
    classDmg: player.stats.classDmg,
    crit: +(player.stats.crit * 100).toFixed(1),
    aspd: +player.stats.aspd.toFixed(2),
  };
}

const originalRandom = Math.random;
try {
  const rows = BUILDS.map(simulate);
  rows.sort((a, b) => b.dps - a.dps);
  console.log("CLASS_DPS_TABLE_JSON=" + JSON.stringify(rows));
  console.log("직업 | DPS | 공격력 | 직업 배율 | 치명타 | 공격속도 | 시전 수");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    console.log(`${i + 1}. ${r.name} | ${r.dps.toLocaleString("ko-KR")} | ${r.atk.toLocaleString("ko-KR")} | ×${r.classDmg} | ${r.crit}% | ×${r.aspd} | ${r.casts}`);
  }
  assert.equal(rows.length, 7);
  for (const r of rows) assert.ok(Number.isFinite(r.dps) && r.dps > 0, `${r.name} should deal measurable damage`);
  console.log("CLASS DPS TESTS: ALL PASS");
} finally {
  Math.random = originalRandom;
}
