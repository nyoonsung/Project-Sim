// 직업·몬스터·보스 → 0x72 스프라이트 + 색. 무기는 손에 들고 조준 방향으로 휘두른다.
import { dtReady, has, frame, animName, drawFoot } from "./dt2.js";

const TINT = {
  bone: { m: "#f4ead0" }, fire: { m: "#ffb080", s: "#300800" }, ice: { m: "#b4dcff", s: "#081830" }, storm: { m: "#c4c4ff", s: "#101040" },
  dark: { m: "#8a80aa", s: "#02000a" }, crimson: { m: "#ff9898", s: "#220000" }, steel: { m: "#d0d8e0", sat: 0.15 }, shadow: { m: "#9474c4", s: "#0a0012" },
  void: { m: "#b488ff", s: "#120024" }, royal: { m: "#ffe2a4", s: "#120800" }, chaos: { m: "#ff8484", s: "#140000" }, green: { m: "#b4e494" },
  rot: { m: "#c4dc94", s: "#081000" }, holy: { m: "#fff8e4", s: "#302c20" }, gold: { m: "#ffe8a4", s: "#181000" }, swamp: { m: "#a8d8a0", s: "#001008" },
  blue: { m: "#a8c4ff", s: "#000818" }, night: { m: "#9c8cb4", s: "#00000a" }, cream: { m: "#fff4d8", s: "#202018" }, bronze: { m: "#f4cc94", s: "#100800" },
};

// 직업 → 몸
// 직업 → 몸: 직업마다 직접 그린 주인공 도트(1배 크기로 그려 2배 스프라이트보다 디테일이 촘촘함)
const HERO = Object.fromEntries(["adventurer", "sword", "fist", "archer", "rogue", "mage", "priest", "smith"].map((c) => [c, { body: "hero_" + c, custom: true }]));
// 무기 종류 → 스프라이트 (bow는 직접 그림, knuckle은 맨손)
const WEAPON = {
  club: "weapon_baton_with_spikes", sword: "weapon_knight_sword", greatsword: "weapon_anime_sword", dagger: "weapon_knife",
  staff: "weapon_red_magic_staff", mace: "weapon_mace", hammer: "weapon_big_hammer",
};
// 사람형 몬스터
const MON = {
  skeleton: ["skelet"], skel_archer: ["skelet", TINT.bone], goblin: ["goblin"], goblin_spear: ["goblin", TINT.green], goblin_shaman: ["orc_shaman"],
  cultist: ["necromancer", TINT.rot], ember_knight: ["orc_warrior", TINT.fire], forge_brute: ["masked_orc", TINT.fire], frost_knight: ["orc_warrior", TINT.ice],
  ice_archer: ["ice_zombie"], storm_guard: ["masked_orc", TINT.storm], tempest_mage: ["orc_shaman", TINT.storm], fallen_paladin: ["knight_m", TINT.dark],
  zealot: ["wizzard_f", TINT.crimson], fallen_blade: ["chort"], automaton: ["wogol", TINT.steel], shade: ["chort", TINT.shadow], void_caller: ["necromancer", TINT.void],
  royal_guard: ["knight_f", TINT.royal], royal_archer: ["elf_m", TINT.royal], chaos_mage: ["wizzard_m", TINT.chaos],
  imp: ["imp"], chaos_hound: ["chort", TINT.crimson],
};
// 보스 (몸, 색, 크기 배율)
const BOSS = {
  skeleton_lord: ["big_zombie", TINT.bone, 2.4], goblin_chief: ["ogre", TINT.green, 2.2], ogre_king: ["ogre", null, 2.5], rot_queen: ["big_zombie", TINT.rot, 2.4],
  magma_golem: ["big_demon", TINT.fire, 2.4], furnace_giant: ["ogre", TINT.fire, 2.7], frost_witch: ["necromancer", TINT.ice, 3.2], frost_lord: ["big_zombie", TINT.ice, 2.6],
  thunder_apostle: ["big_demon", TINT.storm, 2.4], fallen_inquisitor: ["necromancer", TINT.gold, 3.2], fallen_archangel: ["big_demon", TINT.holy, 2.6],
  clock_warden: ["ogre", TINT.steel, 2.4], machine_colossus: ["big_zombie", TINT.steel, 2.8], chaos_knight: ["big_demon", TINT.dark, 2.5], dungeon_king: ["big_demon", TINT.crimson, 2.9],
};

export function dtLookFor(e) {
  if (!dtReady()) return null;
  const info = e.info ?? {};
  if (e.k === "p") { const h = HERO[info.c] ?? HERO.adventurer; return { body: h.body, tint: h.tint ?? null, scale: 2, hero: true, custom: !!h.custom, glove: info.c === "fist", weapon: info.w, off: info.o }; }
  if (e.k === "m") { const m = MON[info.m]; if (!m || !has(m[0] + "_idle_anim_f0")) return null; return { body: m[0], tint: m[1] ?? null, scale: info.el ? 2.3 : 2 }; }
  if (e.k === "b") { const b = BOSS[info.b]; if (!b) return null; return { body: b[0], tint: b[1] ?? null, scale: b[2] }; }
  return null;
}

const ease = (p) => 1 - (1 - p) * (1 - p);
/** 몸 + 무기 그리기. st = { moving, hurt, flip, aim(라디안), anim: {name, p(0~1)} | null, t, glow } */
export function drawDT(ctx, e, L, x, y, st) {
  const { moving, hurt, flip, aim, anim, t } = st;
  const seed = (e.id ?? 0) * 0.137;
  let base = L.body + (hurt && has(L.body + "_hit_anim_f0") ? "_hit_anim" : moving ? "_run_anim" : "_idle_anim");
  const name = animName(base, t + seed, moving ? 11 : 6);
  // 몬스터 공격: 앞으로 살짝 덤빔
  let lx = 0, ly = 0;
  if (!L.hero && anim) { const k = Math.sin(Math.min(1, anim.p) * Math.PI) * 7 * (L.scale / 2); lx = Math.cos(aim) * k; ly = Math.sin(aim) * k * 0.6; }
  // 무기 계산
  let w = null;
  if (L.hero) w = weaponPose(L, x, y, st);
  const behind = w && Math.sin(w.rot - Math.PI / 2) < -0.35 && !w.front;
  if (w && behind) drawWeapon(ctx, w, st);
  if (L.hero && L.off === "shield") drawShield(ctx, x, y + (L.custom ? 4 : 0), flip); // 방패는 등 뒤 팔에 (몸 뒤)
  const bs = L.custom ? L.scale / 2 : L.scale; // 직접 그린 주인공은 1배 크기 도트
  drawFoot(ctx, name, Math.round(x + lx), Math.round(y + ly), { tint: L.tint, white: hurt, scale: bs, flip });
  if (st.glow) { ctx.globalAlpha = st.glow; drawFoot(ctx, name, Math.round(x + lx), Math.round(y + ly), { white: true, scale: bs, flip }); ctx.globalAlpha = 1; }
  if (w && !behind) drawWeapon(ctx, w, st);
}

function weaponPose(L, x, y, st) {
  const { flip, aim, anim, t } = st;
  const type = L.weapon;
  const dir = flip ? -1 : 1;
  const k = L.scale / 2;
  // 손 위치: 직접 그린 주인공은 앞손이 발에서 (8, -16)
  const hx = x + dir * (L.custom ? 8 : 7) * k, hy = y - (L.custom ? 16 : 22) * k + (st.moving ? Math.round(Math.sin(t * 22) * 1) : 0);
  const pose = { type, hx, hy, rot: aim + Math.PI / 2, ox: 0, oy: 0, trail: null, glow: 0, front: false, k, glove: L.glove, custom: L.custom };
  if (type === "bow") { pose.rot = aim; pose.hx = x + Math.cos(aim) * 10; pose.hy = y - 22 + Math.sin(aim) * 6; pose.pull = anim?.name === "shoot" ? Math.sin(Math.min(1, anim.p) * Math.PI) : 0; return pose; }
  if (!anim) {
    // 평소: 조준 방향으로 비스듬히 듦
    const idle = aim * 0.35 + (flip ? Math.PI : 0) * 0.65 + (flip ? 0.6 : -0.6);
    pose.rot = (flip ? -0.55 : 0.55) + Math.sin(t * 2) * 0.04;
    if (type === "staff" || type === "mace") pose.rot = flip ? -0.25 : 0.25;
    void idle;
    return pose;
  }
  const p = Math.min(1, anim.p);
  switch (anim.name) {
    case "slash": case "smash": case "spin": case "cleave": {
      // 위에서 아래로 크게 휘두름 + 궤적
      const from = -1.9, to = 1.4, cur = from + (to - from) * ease(p);
      pose.rot = aim + Math.PI / 2 + cur * dir;
      pose.trail = { a0: aim + from * dir, a1: aim + cur * dir, ccw: dir < 0 };
      pose.front = true;
      if (anim.name === "spin") { pose.rot = aim + Math.PI / 2 + p * Math.PI * 2 * dir; pose.trail = { a0: aim, a1: aim + p * Math.PI * 2 * dir, ccw: dir < 0 }; }
      break;
    }
    case "thrust": case "stab": case "punch": {
      const k = Math.sin(p * Math.PI);
      pose.rot = aim + Math.PI / 2;
      pose.ox = Math.cos(aim) * 14 * k; pose.oy = Math.sin(aim) * 14 * k;
      pose.front = true;
      break;
    }
    case "cast": case "channel": {
      pose.rot = (flip ? -0.15 : 0.15) - 0.1 * Math.sin(p * Math.PI);
      pose.hy -= 6 * Math.sin(p * Math.PI);
      pose.glow = Math.sin(p * Math.PI);
      break;
    }
    case "guard": pose.rot = flip ? 0.9 : -0.9; pose.front = true; break;
    case "dash": pose.rot = aim + Math.PI / 2 + 0.9 * dir; break;
    default: pose.rot = aim + Math.PI / 2;
  }
  return pose;
}

function drawWeapon(ctx, w, st) {
  if (w.custom && (w.type === "knuckle" || !w.type)) {
    // 직접 그린 주인공은 손이 이미 그려져 있음 → 주먹을 내지를 때만 앞으로 나가는 주먹(권투사는 빨간 글러브)
    if (Math.hypot(w.ox, w.oy) < 2) return;
    const fx = Math.round(w.hx + w.ox), fy = Math.round(w.hy + w.oy);
    if (w.glove) {
      ctx.fillStyle = "#120806"; ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d8262c"; ctx.beginPath(); ctx.arc(fx, fy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff6a5a"; ctx.fillRect(fx, fy - 3, 2, 2);
    } else { ctx.fillStyle = "#1a0e0a"; ctx.fillRect(fx - 3, fy - 3, 6, 6); ctx.fillStyle = "#f8d4ae"; ctx.fillRect(fx - 2, fy - 2, 4, 4); }
    return;
  }
  if (w.type === "knuckle" || !w.type) {
    // 맨손: 주먹 하나
    ctx.fillStyle = "#e8c8a0"; ctx.fillRect(Math.round(w.hx + w.ox - 3), Math.round(w.hy + w.oy - 3), 6, 6);
    ctx.fillStyle = "#000"; ctx.globalAlpha = 0.5; ctx.fillRect(Math.round(w.hx + w.ox - 3), Math.round(w.hy + w.oy + 2), 6, 1); ctx.globalAlpha = 1;
    return;
  }
  if (w.type === "bow") return drawBow(ctx, w);
  const sp = WEAPON[w.type] ?? WEAPON.sword;
  const c = frame(sp, null, false);
  if (!c) return;
  const S = 1.6 * (w.k ?? 1), ww = c.width * S, hh = c.height * S;
  // 휘두름 궤적
  if (w.trail) {
    const r = hh * 0.75;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(w.hx, w.hy, r, w.trail.a0, w.trail.a1, w.trail.ccw); ctx.stroke();
    ctx.strokeStyle = "rgba(255,240,200,0.9)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w.hx, w.hy, r, w.trail.a1 - (w.trail.ccw ? -0.5 : 0.5), w.trail.a1, w.trail.ccw); ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(Math.round(w.hx + w.ox), Math.round(w.hy + w.oy));
  ctx.rotate(w.rot);
  ctx.drawImage(c, Math.round(-ww / 2), Math.round(-hh * 0.82), ww, hh);
  ctx.restore();
  if (w.glow > 0.05) {
    const tx = w.hx + Math.sin(w.rot) * hh * 0.8, ty = w.hy - Math.cos(w.rot) * hh * 0.8;
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 14);
    g.addColorStop(0, `rgba(255,240,200,${0.9 * w.glow})`); g.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = g; ctx.fillRect(tx - 14, ty - 14, 28, 28);
  }
}

function drawBow(ctx, w) {
  ctx.save();
  ctx.translate(Math.round(w.hx), Math.round(w.hy));
  ctx.rotate(w.rot);
  const pull = (w.pull ?? 0) * 6;
  ctx.strokeStyle = "#2a1608"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(-4, 0, 13, -1.25, 1.25); ctx.stroke();
  ctx.strokeStyle = "#a8743a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-4, 0, 13, -1.25, 1.25); ctx.stroke();
  ctx.strokeStyle = "#f0f0f0"; ctx.lineWidth = 1;
  const ex = -4 + Math.cos(1.25) * 13, ey = Math.sin(1.25) * 13;
  ctx.beginPath(); ctx.moveTo(ex, -ey); ctx.lineTo(-pull, 0); ctx.lineTo(ex, ey); ctx.stroke();
  if (pull > 0.5) { ctx.fillStyle = "#e8e8e8"; ctx.fillRect(-pull, -1, 18, 2); ctx.fillStyle = "#c0c8d0"; ctx.fillRect(18 - pull, -2, 3, 4); }
  ctx.restore();
}

function drawShield(ctx, x, y, flip) {
  const sx = Math.round(x + (flip ? 3 : -13)), sy = Math.round(y - 30);
  ctx.fillStyle = "#1a0e06"; ctx.fillRect(sx - 1, sy - 1, 12, 16);
  ctx.fillStyle = "#8a5a32"; ctx.fillRect(sx, sy, 10, 14);
  ctx.fillStyle = "#a8743e"; ctx.fillRect(sx + 1, sy + 1, 3, 12);
  ctx.fillStyle = "#6a6e7c"; ctx.fillRect(sx + 4, sy, 2, 14);
  ctx.fillStyle = "#c8ccd8"; ctx.fillRect(sx + 4, sy + 5, 2, 3);
}
