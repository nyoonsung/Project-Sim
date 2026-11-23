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
const HERO = {
  adventurer: { body: "knight_m" }, sword: { body: "knight_m", tint: TINT.blue }, fist: { body: "lizard_m" }, archer: { body: "elf_m" },
  rogue: { body: "elf_f", tint: TINT.night }, mage: { body: "wizzard_m" }, priest: { body: "wizzard_f", tint: TINT.cream }, smith: { body: "knight_f", tint: TINT.bronze },
};
// 2차 전직 외형: 1차 전직 몸(실루엣)은 그대로 두고, 색(전직 고유색)과 장신구·오라로 차별화
//  acc: [종류, 색] — 뒤(망토·날개·톱니·그림자)는 몸 뒤에, 앞(왕관·후광·뿔·구슬·불씨 …)은 몸 앞에 그림
const HERO2 = {
  darkknight: { tint: { m: "#c88aa0", s: "#1a0008" }, acc: [["cape", "#5a0a1a"], ["horns", "#3a0a14"], ["aura", "#c0304a"]] },
  swordmaster: { tint: { m: "#cfe4ff", s: "#06101e" }, acc: [["cape", "#2a4a8a"], ["plume", "#7ab8ff"], ["aura", "#7ab8ff"]] },
  vajra: { tint: { m: "#ffe8a4", s: "#181000" }, acc: [["halo", "#ffd860"], ["beads", "#c89040"], ["aura", "#e8c060"]] },
  striker: { tint: { m: "#ffe8a0", s: "#201400" }, acc: [["scarf", "#ff5a3a"], ["sparks", "#ffe070"]] },
  archmage: { tint: { m: "#b8e8ff", s: "#001428" }, acc: [["orbs", null], ["aura", "#7fd8ff"]] },
  warlock: { tint: { m: "#b488ff", s: "#120024" }, acc: [["horns", "#5a2a8a"], ["shadow", "#a060e0"]] },
  arcanearcher: { tint: { m: "#d0c0ff", s: "#100828" }, acc: [["scarf", "#6a4ac8"], ["runes", "#b090ff"]] },
  windwalker: { tint: { m: "#c8ffd8", s: "#002010" }, acc: [["scarf", "#2aa870"], ["wind", "#c8ffe0"]] },
  sentinel: { tint: { m: "#c8d0c0", s: "#0a0c08" }, acc: [["cape", "#4a5a3a"], ["glint", "#ff4040"]] },
  nightblade: { tint: { m: "#a898d8", s: "#04001a" }, acc: [["scarf", "#3a2a6a"], ["eyes", "#c0a0ff"]] },
  assassin: { tint: { m: "#8a8098", s: "#000000" }, acc: [["cape", "#101018"], ["shadow", "#303040"], ["eyes", "#ff3040"]] },
  trickster: { tint: { m: "#c0f0a0", s: "#081000" }, acc: [["cards", "#f0f0e0"], ["shadow", "#80ff60"]] },
  inquisitor: { tint: { m: "#fff8e4", s: "#302c20" }, acc: [["wings", "#fff4d0"], ["halo", "#ffe8a0"]] },
  heretic: { tint: { m: "#e8a0c8", s: "#200010" }, acc: [["thorns", "#a02060"], ["shadow", "#d060a0"]] },
  volcano: { tint: { m: "#ffb080", s: "#300800" }, acc: [["cape", "#7a1a08"], ["embers", "#ff7030"]] },
  mechanic: { tint: { m: "#d0d8e0", sat: 0.15 }, acc: [["gear", "#9aa8b8"], ["sparks", "#7ae0ff"]] },
  king: { tint: { m: "#ffe2a4", s: "#120800" }, acc: [["cape", "#8a1a24"], ["crown", "#ffd860"], ["aura", "#ffd35a"]] },
};
const BACK_ACC = new Set(["cape", "wings", "gear", "shadow", "aura", "wind"]);

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
  resonance_tracker: ["chort", TINT.void], shard_golem: ["ogre", TINT.steel],
  abyss_sorcerer: ["necromancer", TINT.void], rift_wraith: ["big_zombie", TINT.shadow],
  poison_spore: ["ogre", TINT.swamp],
};
// 보스 (몸, 색, 크기 배율)
const BOSS = {
  skeleton_lord: ["big_zombie", TINT.bone, 2.4], goblin_chief: ["ogre", TINT.green, 2.2], ogre_king: ["ogre", null, 2.5], rot_queen: ["big_zombie", TINT.rot, 2.4],
  magma_golem: ["big_demon", TINT.fire, 2.4], furnace_giant: ["ogre", TINT.fire, 2.7], frost_witch: ["necromancer", TINT.ice, 3.2], frost_lord: ["big_zombie", TINT.ice, 2.6],
  thunder_apostle: ["big_demon", TINT.storm, 2.4], fallen_inquisitor: ["necromancer", TINT.gold, 3.2], fallen_archangel: ["big_demon", TINT.holy, 2.6],
  clock_warden: ["ogre", TINT.steel, 2.4], machine_colossus: ["big_zombie", TINT.steel, 2.8], chaos_knight: ["big_demon", TINT.dark, 2.5], dungeon_king: ["big_demon", TINT.crimson, 2.9],
  rift_harbinger: ["big_demon", TINT.crimson, 2.5], scarlet_regent: ["big_demon", TINT.crimson, 2.7],
  null_archivist: ["necromancer", TINT.blue, 2.5], paradox_engine: ["ogre", TINT.steel, 2.8],
  eclipse_warden: ["big_zombie", TINT.void, 2.5], void_emperor: ["big_demon", TINT.void, 2.9],
  abyss_watcher: ["big_demon", TINT.void, 3.0],
};

export function dtLookFor(e) {
  if (!dtReady()) return null;
  const info = e.info ?? {};
  if (e.k === "p") {
    const h = HERO[info.c] ?? HERO.adventurer, h2 = info.c2 ? HERO2[info.c2] : null;
    return { body: h.body, tint: h2?.tint ?? h.tint ?? null, scale: 2, hero: true, weapon: info.w, off: info.o, acc: h2?.acc ?? null };
  }
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
  if (L.acc) for (const [k, c] of L.acc) if (BACK_ACC.has(k)) drawAcc(ctx, k, c, x, y, flip, t, seed);
  if (L.hero && L.off === "shield") drawShield(ctx, x, y, flip); // 방패는 등 뒤 팔에 (몸 뒤)
  drawFoot(ctx, name, Math.round(x + lx), Math.round(y + ly), { tint: L.tint, white: hurt, scale: L.scale, flip });
  if (st.glow) { ctx.globalAlpha = st.glow; drawFoot(ctx, name, Math.round(x + lx), Math.round(y + ly), { white: true, scale: L.scale, flip }); ctx.globalAlpha = 1; }
  if (L.acc) for (const [k, c] of L.acc) if (!BACK_ACC.has(k)) drawAcc(ctx, k, c, x, y + (moving ? Math.round(Math.sin(t * 22)) : 0), flip, t, seed);
  if (w && !behind) drawWeapon(ctx, w, st);
}

function weaponPose(L, x, y, st) {
  const { flip, aim, anim, t } = st;
  const type = L.weapon;
  const dir = flip ? -1 : 1;
  const k = L.scale / 2;
  const hx = x + dir * 7 * k, hy = y - 22 * k + (st.moving ? Math.round(Math.sin(t * 22) * 1) : 0);
  const pose = { type, hx, hy, rot: aim + Math.PI / 2, ox: 0, oy: 0, trail: null, glow: 0, front: false, k };
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

/** 2차 전직 장신구 (발 위치 x,y 기준 · 몸 크기 약 32×56) */
function drawAcc(ctx, kind, col, x, y, flip, t, seed) {
  const d = flip ? -1 : 1;
  const px = (X, Y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(X), Math.round(Y), w, h); };
  ctx.save();
  switch (kind) {
    case "cape": { // 등 뒤로 늘어진 망토 (펄럭임)
      const wv = Math.sin(t * 4 + seed) * 2;
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(x - 9, y - 36); ctx.lineTo(x + 9, y - 36);
      ctx.lineTo(x + 12 - d * 3 + wv, y - 6); ctx.lineTo(x - 12 - d * 3 + wv, y - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(Math.round(x - 12 - d * 3 + wv), y - 9, 24, 3);
      break;
    }
    case "wings": { // 빛나는 날개 한 쌍
      const f = Math.sin(t * 3 + seed) * 3;
      ctx.globalAlpha = 0.85; ctx.fillStyle = col;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 4, y - 34); ctx.quadraticCurveTo(x + s * 26, y - 52 - f, x + s * 30, y - 30 - f); ctx.quadraticCurveTo(x + s * 18, y - 26, x + s * 4, y - 24); ctx.fill(); }
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#ffffff"; for (const s of [-1, 1]) ctx.fillRect(Math.round(x + s * 14 - 1), Math.round(y - 40 - f / 2), 3, 8);
      break;
    }
    case "gear": { // 등 뒤에서 도는 톱니바퀴
      const r = 11, a0 = t * 1.5;
      ctx.translate(x - d * 8, y - 32); ctx.rotate(a0); ctx.fillStyle = col;
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-2, -r - 3, 4, 5); }
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#3a4048"; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "shadow": case "aura": case "wind": { // 발밑 오라 + 피어오르는 입자
      ctx.globalAlpha = kind === "shadow" ? 0.35 : 0.28; ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(x, y - 1, 15 + Math.sin(t * 3 + seed) * 2, 5, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) {
        const k = (t * (kind === "wind" ? 1.4 : 0.7) + i / 4 + seed) % 1;
        const ax = x + Math.sin(i * 2.1 + t * (kind === "wind" ? 4 : 1.5)) * (kind === "wind" ? 16 : 11);
        ctx.globalAlpha = (1 - k) * (kind === "shadow" ? 0.6 : 0.7);
        px(ax, y - 4 - k * 40, kind === "wind" ? 3 : 2, kind === "wind" ? 1 : 2, col);
      }
      break;
    }
    case "halo": // 머리 위 후광
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.85 + Math.sin(t * 3) * 0.1;
      ctx.beginPath(); ctx.ellipse(x, y - 58 + Math.sin(t * 2 + seed), 8, 3, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case "crown": // 왕관
      px(x - 7, y - 56, 14, 3, col);
      for (const k of [-6, -1, 4]) px(x + k, y - 60, 2, 4, col);
      px(x - 1, y - 55, 2, 1, "#ff4060");
      break;
    case "thorns": // 가시 관
      ctx.fillStyle = col;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 3.5 - 1.5, y - 54); ctx.lineTo(x + i * 3.5, y - 60 - (i % 2 ? 0 : 2)); ctx.lineTo(x + i * 3.5 + 1.5, y - 54); ctx.fill(); }
      break;
    case "horns": // 뿔 한 쌍
      ctx.fillStyle = col;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 4, y - 52); ctx.quadraticCurveTo(x + s * 11, y - 56, x + s * 9, y - 62); ctx.lineTo(x + s * 7, y - 54); ctx.fill(); }
      break;
    case "plume": // 투구 깃털
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - d * 2, y - 54); ctx.quadraticCurveTo(x - d * 10, y - 62 + Math.sin(t * 5) * 1.5, x - d * 14, y - 52); ctx.lineTo(x - d * 2, y - 52); ctx.fill();
      break;
    case "scarf": { // 목도리 꼬리
      const wv = Math.sin(t * 7 + seed) * 2;
      px(x - 7, y - 40, 14, 3, col);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - d * 5, y - 39); ctx.lineTo(x - d * 16, y - 36 + wv); ctx.lineTo(x - d * 15, y - 32 + wv); ctx.lineTo(x - d * 4, y - 36); ctx.fill();
      break;
    }
    case "beads": // 염주
      for (let i = 0; i < 7; i++) { const a = Math.PI * (0.15 + (i / 6) * 0.7); px(x + Math.cos(a) * 8 - 1, y - 40 + Math.sin(a) * 4, 2, 2, col); }
      break;
    case "eyes": // 빛나는 눈
      ctx.globalAlpha = 0.7 + Math.sin(t * 4 + seed) * 0.3;
      px(x + d * 2, y - 46, 2, 1, col); px(x + d * 6, y - 46, 2, 1, col);
      break;
    case "glint": // 저격 조준경 반짝임
      ctx.globalAlpha = Math.max(0, Math.sin(t * 2.5 + seed)); px(x + d * 6, y - 46, 2, 2, col);
      break;
    case "orbs": { // 원소 구슬 셋 (화염·빙결·번개)
      const cs = ["#ff7a3a", "#7ad8ff", "#ffe060"];
      for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.094 + seed; const ox = Math.cos(a) * 16, oy = Math.sin(a) * 6; px(x + ox - 2, y - 30 + oy - 2, 4, 4, cs[i]); ctx.globalAlpha = 0.3; px(x + ox - 3, y - 30 + oy - 3, 6, 6, cs[i]); ctx.globalAlpha = 1; }
      break;
    }
    case "runes": { // 떠다니는 룬 문자
      const a = t * 1.6 + seed, ox = Math.cos(a) * 15, oy = Math.sin(a * 0.7) * 4;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
      ctx.strokeRect(Math.round(x + ox - 3) + 0.5, Math.round(y - 38 + oy - 3) + 0.5, 6, 6);
      px(x + ox - 1, y - 38 + oy - 1, 2, 2, col);
      break;
    }
    case "cards": // 주위를 도는 카드 두 장
      for (let i = 0; i < 2; i++) { const a = t * 2.4 + i * Math.PI + seed; const ox = Math.cos(a) * 15, oy = Math.sin(a) * 5; px(x + ox - 2, y - 28 + oy - 3, 4, 6, col); px(x + ox - 1, y - 28 + oy - 1, 2, 2, i ? "#e03040" : "#202020"); }
      break;
    case "sparks": // 손 주변 전기 불꽃
      for (let i = 0; i < 3; i++) { if (Math.sin(t * 13 + i * 2 + seed) < 0.3) continue; px(x + d * 8 + Math.sin(t * 31 + i) * 6, y - 24 + Math.cos(t * 27 + i) * 5, 2, 2, col); }
      break;
    case "embers": // 몸에서 피어오르는 불씨
      for (let i = 0; i < 5; i++) { const k = (t * 0.9 + i / 5 + seed) % 1; ctx.globalAlpha = 1 - k; px(x + Math.sin(i * 1.7 + t * 2) * 10, y - 10 - k * 46, 2, 2, i % 2 ? col : "#ffd35a"); }
      break;
  }
  ctx.restore();
}
