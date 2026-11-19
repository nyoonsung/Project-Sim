// 던전 1~100층: 10층 단위 구역(팔레트·몬스터·보스). 5층마다 중간보스, 10층마다 주요 보스.
//
// 몬스터 ai: chaser(근접 추적) | ranged(거리 유지 사격) | charger(예고 후 돌진) | caster(예고 장판) | swarm(빠르고 약함) | bomber(접근 후 자폭)
// look: { rig: {...} } → 픽셀 리그 휴머노이드,  { critter: 'critters/slime', palette } → pixelfx 생물
// hp·dmg 는 층 배율이 곱해지는 기본값

const P = {
  bone: { armor: ["#f0ead6", "#cfc6aa", "#a39a7e", "#6e6752"], core: ["#3a3530", "#2a2622", "#1a1714"], mark: "#ff4030" },
  goblin: { armor: ["#9ccf62", "#76a844", "#517a2c", "#33501a"], core: ["#6b4a2a", "#4c331c", "#30200f"], mark: "#ffde40" },
  cult: { armor: ["#9a5ab8", "#723f8c", "#4f2a62", "#2f183c"], core: ["#2a1530", "#1c0d22", "#100714"], mark: "#ff60c0" },
  ember: { armor: ["#ff9a50", "#d86a2a", "#a8461a", "#6a2a10"], core: ["#3a1a10", "#2a120a", "#1a0a06"], mark: "#ffe060" },
  frost: { armor: ["#e0f6ff", "#a8d8f0", "#70a8d0", "#40709a"], core: ["#284a6a", "#1a3450", "#0e2034"], mark: "#80ffff" },
  storm: { armor: ["#d8e0ff", "#a0b0f0", "#6a78c8", "#404a90"], core: ["#2a2a5a", "#1c1c40", "#10102a"], mark: "#fff070" },
  holy: { armor: ["#fff4d8", "#e8d4a0", "#c0a060", "#806838"], core: ["#5a4020", "#402c14", "#281a0a"], mark: "#ffffff" },
  fallen: { armor: ["#c8c0d0", "#9890a8", "#686078", "#403a4c"], core: ["#3a1020", "#280a16", "#18060c"], mark: "#ff3050" },
  brass: { armor: ["#f0d080", "#c8a050", "#987030", "#604418"], core: ["#4a4a52", "#34343a", "#202024"], mark: "#40e0ff" },
  void: { armor: ["#6a5a8a", "#4a3e66", "#2e2644", "#1a1428"], core: ["#140c20", "#0c0614", "#06030a"], mark: "#c040ff" },
  royal: { armor: ["#ffd860", "#d0a030", "#a07018", "#60400a"], core: ["#5a0a1a", "#400612", "#28030a"], mark: "#ff2040" },
};
const rig = (pal, weapon, head = null, headColor = null, scale = 1) => ({ rig: { ...pal, weapon, head, headColor }, scale });
const critter = (fx, palette, scale = 1) => ({ critter: fx, palette, scale });
const GREENS = ["#062010", "#0e4a1e", "#1f8a34", "#4fd060", "#b0ff9a", "#f0fff0"];
const RIFT = { armor: ["#ffb0aa", "#d85b67", "#933344", "#491a2b"], core: ["#421522", "#2a0c18", "#160710"], mark: "#fff0d0" };
const CHRONO = { armor: ["#a8f0f0", "#62b8c4", "#347a8e", "#1b3a58"], core: ["#122c42", "#0c1c32", "#060e1b"], mark: "#ffe070" };
const ECLIPSE = { armor: ["#c9adff", "#8d69c8", "#573d90", "#2b1c52"], core: ["#1b102f", "#10091f", "#080412"], mark: "#ff75d8" };

export const MONSTERS = {
  // 1구역: 이끼 낀 지하묘지
  slime: { name: "이끼 슬라임", ai: "chaser", hp: 34, dmg: 7, speed: 52, range: 22, atkCd: 1.6, xp: 1, look: critter("critters/slime", GREENS) },
  bat: { name: "동굴 박쥐", ai: "swarm", hp: 18, dmg: 5, speed: 105, range: 18, atkCd: 1.1, xp: 0.7, fly: true, look: critter("critters/bat") },
  skeleton: { name: "해골 병사", ai: "chaser", hp: 11, dmg: 8, speed: 62, range: 34, atkCd: 1.7, xp: 1.3, look: rig(P.bone, "sword") },
  skel_archer: { name: "해골 궁수", ai: "ranged", hp: 10, dmg: 7, speed: 55, range: 220, atkCd: 2.2, xp: 1.3, proj: "projectiles/arrow", look: rig(P.bone, "bow") },
  // 2구역: 고블린 굴
  goblin: { name: "고블린 약탈자", ai: "chaser", hp: 44, dmg: 9, speed: 78, range: 30, atkCd: 1.3, xp: 1.2, look: rig(P.goblin, "dagger", "cap", "#7a3a20", 0.85) },
  goblin_spear: { name: "고블린 창병", ai: "charger", hp: 56, dmg: 12, speed: 66, range: 44, atkCd: 2.6, xp: 1.5, look: rig(P.goblin, "spear", "helm", "#6a6f78", 0.9) },
  goblin_shaman: { name: "고블린 주술사", ai: "caster", hp: 38, dmg: 11, speed: 55, range: 200, atkCd: 3.2, xp: 1.6, aoe: "nature/poison-cloud", look: rig(P.goblin, "staff", "hat", "#5a2a6a", 0.85) },
  wolf: { name: "굴 늑대", ai: "swarm", hp: 30, dmg: 8, speed: 120, range: 22, atkCd: 1.0, xp: 1, look: critter("critters/snake", ["#140c08", "#3a2414", "#6a4628", "#a07a50", "#e0c8a0", "#ffffff"], 1.1) },
  // 3구역: 독버섯 늪
  toad: { name: "독두꺼비", ai: "ranged", hp: 52, dmg: 10, speed: 50, range: 180, atkCd: 2.4, xp: 1.5, proj: "nature/acid-splash", projSmall: true, look: critter("critters/frog", ["#0a1a06", "#2a4a10", "#5a8a20", "#a0d040", "#e8ff90", "#ffffff"], 1.2) },
  bog_slime: { name: "늪 슬라임", ai: "bomber", hp: 40, dmg: 18, speed: 70, range: 30, atkCd: 1, xp: 1.4, look: critter("critters/slime", ["#140a1a", "#3a1a4a", "#6a2a8a", "#a050d0", "#e0b0ff", "#ffffff"]) },
  cultist: { name: "부패 신도", ai: "caster", hp: 50, dmg: 12, speed: 58, range: 210, atkCd: 3, xp: 1.6, aoe: "nature/spore-burst", look: rig(P.cult, "staff", "hood", "#3a1a48") },
  snake: { name: "늪 독사", ai: "charger", hp: 46, dmg: 13, speed: 80, range: 30, atkCd: 2.2, xp: 1.4, poison: true, look: critter("critters/snake", ["#0a1406", "#1a3a10", "#3a7020", "#80c040", "#d0ff90", "#ffffff"]) },
  // 4구역: 화염 용광로
  imp: { name: "불꽃 임프", ai: "ranged", hp: 46, dmg: 12, speed: 82, range: 200, atkCd: 2, xp: 1.5, proj: "fire/fireball", fly: true, look: critter("fire/spirit-flame", ["#200400", "#801800", "#e04010", "#ff9030", "#ffe090", "#ffffff"], 0.7) },
  ember_knight: { name: "용암 기사", ai: "chaser", hp: 90, dmg: 16, speed: 58, range: 40, atkCd: 1.9, xp: 2, look: rig(P.ember, "greatsword", "helm", "#3a1a10") },
  magma_slime: { name: "마그마 슬라임", ai: "bomber", hp: 55, dmg: 22, speed: 64, range: 30, atkCd: 1, xp: 1.6, look: critter("critters/slime", ["#200400", "#801800", "#e04010", "#ff9030", "#ffe090", "#ffffff"]) },
  forge_brute: { name: "용광로 짐꾼", ai: "charger", hp: 110, dmg: 20, speed: 56, range: 44, atkCd: 2.8, xp: 2.2, look: rig(P.ember, "hammer", null, null, 1.1) },
  // 5구역: 얼어붙은 성채
  wraith: { name: "서리 망령", ai: "caster", hp: 60, dmg: 15, speed: 64, range: 220, atkCd: 3, xp: 1.8, aoe: "ice/ice-spikes", fly: true, look: critter("critters/ghost", ["#061420", "#103050", "#3070a0", "#80c8f0", "#e0f8ff", "#ffffff"]) },
  frost_knight: { name: "서리 기사", ai: "chaser", hp: 110, dmg: 17, speed: 60, range: 44, atkCd: 1.9, xp: 2.2, look: rig(P.frost, "spear", "helm", "#a8c8e0") },
  ice_archer: { name: "빙궁수", ai: "ranged", hp: 66, dmg: 15, speed: 60, range: 240, atkCd: 2.1, xp: 1.9, proj: "ice/ice-lance", look: rig(P.frost, "bow", "hood", "#5a8ab0") },
  snow_wisp: { name: "눈보라 정령", ai: "swarm", hp: 40, dmg: 11, speed: 115, range: 20, atkCd: 1, xp: 1.2, fly: true, look: critter("critters/wisp", ["#061420", "#103050", "#3070a0", "#80c8f0", "#e0f8ff", "#ffffff"]) },
  // 6구역: 폭풍 첨탑
  storm_wisp: { name: "번개 정령", ai: "ranged", hp: 70, dmg: 17, speed: 90, range: 220, atkCd: 1.8, xp: 2, proj: "lightning/ball-lightning", projSmall: true, fly: true, look: critter("critters/wisp") },
  storm_guard: { name: "폭풍 근위병", ai: "charger", hp: 130, dmg: 22, speed: 64, range: 46, atkCd: 2.6, xp: 2.4, look: rig(P.storm, "spear", "helm", "#c0c8ff") },
  tempest_mage: { name: "폭풍술사", ai: "caster", hp: 80, dmg: 20, speed: 60, range: 240, atkCd: 3, xp: 2.3, aoe: "lightning/lightning-strike", look: rig(P.storm, "staff", "hat", "#404a90") },
  jelly: { name: "공중 해파리", ai: "bomber", hp: 70, dmg: 26, speed: 70, range: 30, atkCd: 1, xp: 2, fly: true, look: critter("critters/jellyfish") },
  // 7구역: 타락한 성역
  fallen_paladin: { name: "타락 성기사", ai: "chaser", hp: 150, dmg: 22, speed: 62, range: 44, atkCd: 1.8, xp: 2.6, look: rig(P.fallen, "hammer", "helm", "#888098") },
  zealot: { name: "광신 사제", ai: "caster", hp: 90, dmg: 22, speed: 60, range: 230, atkCd: 3, xp: 2.4, aoe: "holy/smite", look: rig(P.holy, "mace", "mitre", "#e8d4a0") },
  halo_wisp: { name: "타락 광휘", ai: "ranged", hp: 80, dmg: 20, speed: 90, range: 230, atkCd: 1.9, xp: 2.2, proj: "projectiles/plasma-shot", fly: true, look: critter("critters/wisp", ["#201808", "#806018", "#d0a830", "#ffe080", "#fff8d0", "#ffffff"]) },
  fallen_blade: { name: "타락 검귀", ai: "swarm", hp: 90, dmg: 18, speed: 118, range: 30, atkCd: 1, xp: 2, look: rig(P.fallen, "sword", "hood", "#3a1020") },
  // 8구역: 태엽 공장
  automaton: { name: "태엽 병정", ai: "chaser", hp: 170, dmg: 24, speed: 60, range: 40, atkCd: 1.7, xp: 2.8, look: rig(P.brass, "spear", "helm", "#c8a050") },
  turret_bot: { name: "사격 드론", ai: "ranged", hp: 100, dmg: 22, speed: 76, range: 250, atkCd: 1.5, xp: 2.5, proj: "projectiles/laser-bolt", fly: true, look: critter("scifi/energy-core", null, 0.5) },
  saw_bot: { name: "톱날 기계", ai: "charger", hp: 150, dmg: 30, speed: 70, range: 40, atkCd: 2.4, xp: 2.8, look: critter("projectiles/energy-disc", null, 0.9) },
  bomb_bot: { name: "자폭 기계", ai: "bomber", hp: 90, dmg: 38, speed: 82, range: 30, atkCd: 1, xp: 2.4, look: critter("scifi/hologram", ["#200800", "#802008", "#e05020", "#ffa040", "#ffe8a0", "#ffffff"], 0.5) },
  // 9구역: 그림자 심연
  eyeball: { name: "심연의 눈알", ai: "ranged", hp: 120, dmg: 26, speed: 70, range: 250, atkCd: 1.8, xp: 3, proj: "shadow/void-orb", projSmall: true, fly: true, look: critter("critters/eyeball") },
  skull: { name: "비명 해골", ai: "swarm", hp: 100, dmg: 24, speed: 125, range: 26, atkCd: 1, xp: 2.6, fly: true, look: critter("critters/flying-skull") },
  shade: { name: "그림자 추적자", ai: "chaser", hp: 200, dmg: 28, speed: 74, range: 40, atkCd: 1.5, xp: 3.2, look: rig(P.void, "scythe", "hood", "#1a1428") },
  void_caller: { name: "공허 소환사", ai: "caster", hp: 140, dmg: 30, speed: 60, range: 240, atkCd: 3, xp: 3.2, aoe: "shadow/grasping-hands", look: rig(P.void, "staff", "hat", "#2e2644") },
  // 10구역: 혼돈의 왕좌
  royal_guard: { name: "왕좌 근위대", ai: "chaser", hp: 260, dmg: 32, speed: 66, range: 44, atkCd: 1.6, xp: 3.6, look: rig(P.royal, "greatsword", "helm", "#d0a030") },
  royal_archer: { name: "왕실 저격수", ai: "ranged", hp: 170, dmg: 30, speed: 66, range: 270, atkCd: 1.7, xp: 3.4, proj: "projectiles/arrow", look: rig(P.royal, "bow", "hood", "#5a0a1a") },
  chaos_mage: { name: "혼돈 마도사", ai: "caster", hp: 180, dmg: 34, speed: 62, range: 250, atkCd: 2.8, xp: 3.6, aoe: "arcane/star-fall", look: rig(P.cult, "staff", "hat", "#ffd860") },
  chaos_hound: { name: "혼돈 사냥개", ai: "swarm", hp: 150, dmg: 28, speed: 130, range: 26, atkCd: 0.9, xp: 3, look: critter("fire/spirit-flame", ["#100818", "#301848", "#6030a0", "#a070e0", "#e0d0ff", "#ffffff"], 0.6) },
  // 제2 던전 1구역: 붉은 균열
  rift_guard: { name: "균열 수호병", ai: "chaser", hp: 210, dmg: 40, speed: 72, range: 42, atkCd: 1.35, xp: 5.2, look: rig(RIFT, "greatsword", "helm", "#491a2b", 1.05) },
  blood_wisp: { name: "혈흔 정령", ai: "swarm", hp: 128, dmg: 34, speed: 142, range: 24, atkCd: 0.9, xp: 4.6, fly: true, look: critter("critters/wisp", ["#240510", "#6a1028", "#c52b48", "#f06a80", "#ffc0c8", "#ffffff"], 1.05) },
  crimson_hunter: { name: "진홍 추격자", ai: "charger", hp: 188, dmg: 46, speed: 96, range: 40, atkCd: 2.0, xp: 5.4, poison: true, look: rig(RIFT, "dagger", "hood", "#761c36", 0.95) },
  shard_mimic: { name: "파편 모방체", ai: "bomber", hp: 174, dmg: 58, speed: 82, range: 30, atkCd: 1.1, xp: 5.0, look: critter("critters/slime", ["#160d20", "#4a1738", "#9f2858", "#e65b86", "#ffd0e0", "#ffffff"], 1.1) },
  // 제2 던전 2구역: 정지한 시계도시
  null_automaton: { name: "무효화 자동인형", ai: "chaser", hp: 260, dmg: 48, speed: 74, range: 42, atkCd: 1.25, xp: 6.0, look: rig(CHRONO, "hammer", "helm", "#1b3a58", 1.05) },
  paradox_marksman: { name: "역행 저격수", ai: "ranged", hp: 172, dmg: 52, speed: 66, range: 270, atkCd: 1.55, xp: 5.8, proj: "projectiles/laser-bolt", look: rig(CHRONO, "bow", "hood", "#1b3a58") },
  chrono_sentinel: { name: "시간 감시자", ai: "charger", hp: 238, dmg: 55, speed: 86, range: 44, atkCd: 2.1, xp: 6.2, look: rig(CHRONO, "spear", "helm", "#347a8e", 1.0) },
  hex_oracle: { name: "저주 예언자", ai: "caster", hp: 190, dmg: 54, speed: 62, range: 250, atkCd: 2.6, xp: 6.4, aoe: "arcane/star-fall", look: rig(ECLIPSE, "staff", "hat", "#2b1c52", 0.95) },
  // 제2 던전 3구역: 별 없는 심연
  void_stalker: { name: "무광 추적자", ai: "swarm", hp: 212, dmg: 58, speed: 154, range: 26, atkCd: 0.85, xp: 6.8, look: rig(ECLIPSE, "dagger", "hood", "#10091f", 0.95) },
  eclipse_cultist: { name: "일식 숭배자", ai: "caster", hp: 238, dmg: 62, speed: 68, range: 255, atkCd: 2.5, xp: 7.2, aoe: "shadow/grasping-hands", look: rig(ECLIPSE, "staff", "mitre", "#10091f") },
  star_eater: { name: "별 포식자", ai: "bomber", hp: 230, dmg: 74, speed: 88, range: 34, atkCd: 1.0, xp: 7.0, look: critter("critters/eyeball", ["#080412", "#29104d", "#6035a0", "#a878df", "#e5caff", "#ffffff"], 1.15) },
  abyss_mirror: { name: "심연의 거울상", ai: "ranged", hp: 252, dmg: 66, speed: 76, range: 260, atkCd: 1.4, xp: 7.4, proj: "shadow/void-orb", projSmall: true, look: critter("scifi/hologram", ["#080412", "#25133d", "#5b2e83", "#a65ac7", "#f0b8ff", "#ffffff"], 0.8) },
  // 제2 던전 전용: 외형뿐 아니라 전투 역할과 AI가 서로 다르다.
  resonance_tracker: { name: "잔향 추적자", ai: "stalker", hp: 240, dmg: 52, speed: 148, range: 28, atkCd: 1.0, xp: 7.0, look: rig(ECLIPSE, "dagger", "hood", "#160d2a", 0.95) },
  shard_golem: { name: "파편 골렘", ai: "guard", hp: 420, dmg: 72, speed: 42, range: 54, atkCd: 2.8, xp: 8.0, look: rig(RIFT, "hammer", "helm", "#491a2b", 1.35) },
  abyss_sorcerer: { name: "심연술사", ai: "summoner", hp: 260, dmg: 58, speed: 58, range: 245, atkCd: 2.5, xp: 7.8, aoe: "shadow/void-orb", summon: "rift_wraith", look: rig(ECLIPSE, "staff", "hat", "#10091f", 1.0) },
  rift_wraith: { name: "균열 망령", ai: "blink", hp: 220, dmg: 64, speed: 98, range: 32, atkCd: 1.1, xp: 7.6, fly: true, look: critter("critters/ghost", ["#080412", "#25133d", "#5b2e83", "#a65ac7", "#f0b8ff", "#ffffff"], 1.1) },
  poison_spore: { name: "독안개 포자체", ai: "spore", hp: 300, dmg: 50, speed: 48, range: 220, atkCd: 2.8, xp: 7.8, aoe: "nature/spore-burst", look: critter("critters/slime", ["#061a12", "#123b2c", "#277b57", "#62c894", "#b8ffd8", "#ffffff"], 1.25) },
};

// 보스 패턴: cleave(전방 부채꼴) slam(원형) ring(도넛, 안쪽 안전) charge(직선 돌진) barrage(전방위 탄막)
//            aimed(조준 사격) rain(낙하 장판 여러 개) summon(소환) pools(잔류 장판) beam(회전 광선) pull(끌어당김)
// 숫자는 telegraph(예고 시간) 등 기본값, 피해는 보스 dmg 배율
const B = (o) => ({ boss: true, xp: 25, ...o });

export const BOSSES = {
  // 1구역
  giant_slime: B({ name: "거대 슬라임", hp: 520, dmg: 12, speed: 50, look: critter("critters/slime", GREENS, 2.4), mid: true,
    patterns: [{ type: "slam", radius: 70, tel: 1.0, pow: 1.4 }, { type: "charge", dist: 220, width: 40, tel: 0.9, pow: 1.3 }, { type: "summon", monster: "slime", n: 3 }, { type: "pools", n: 4, radius: 34, dur: 6, pow: 0.3, fx: "nature/toxic-puddle" }] }),
  skeleton_lord: B({ name: "해골 기사단장 그라임", hp: 1100, dmg: 15, speed: 64, look: rig(P.bone, "greatsword", "helm", "#6e6752", 2),
    patterns: [{ type: "cleave", range: 96, arc: 120, tel: 0.8, pow: 1.6 }, { type: "slam", radius: 90, tel: 1.1, pow: 1.5 }, { type: "summon", monster: "skeleton", n: 3 }, { type: "charge", dist: 260, width: 44, tel: 1.0, pow: 1.5 }, { type: "barrage", count: 12, speed: 160, pow: 0.8, fx: "projectiles/arrow", phase2: true }] }),
  // 2구역
  goblin_chief: B({ name: "고블린 전쟁족장", hp: 1500, dmg: 18, speed: 72, look: rig(P.goblin, "hammer", "helm", "#7a3a20", 1.7), mid: true,
    patterns: [{ type: "cleave", range: 80, arc: 140, tel: 0.7, pow: 1.5 }, { type: "charge", dist: 240, width: 40, tel: 0.8, pow: 1.5 }, { type: "summon", monster: "goblin", n: 4 }, { type: "rain", n: 5, radius: 40, tel: 1.1, pow: 1.1, fx: "explosions/grenade" }] }),
  ogre_king: B({ name: "오우거 대족장 크루그", hp: 2600, dmg: 22, speed: 58, look: rig(P.goblin, "greatsword", "band", "#a03020", 2.3),
    patterns: [{ type: "slam", radius: 110, tel: 1.2, pow: 1.8, fx: "impacts/ground-slam" }, { type: "ring", inner: 60, outer: 170, tel: 1.3, pow: 1.6 }, { type: "charge", dist: 300, width: 50, tel: 1.0, pow: 1.6 }, { type: "summon", monster: "goblin_spear", n: 2 }, { type: "rain", n: 7, radius: 44, tel: 1.0, pow: 1.2, fx: "nature/boulder", phase2: true }] }),
  // 3구역
  rot_matron: B({ name: "부패 어미 두꺼비", hp: 3000, dmg: 24, speed: 50, look: critter("critters/frog", ["#0a1a06", "#2a4a10", "#5a8a20", "#a0d040", "#e8ff90", "#ffffff"], 2.6), mid: true,
    patterns: [{ type: "aimed", count: 5, spread: 40, speed: 220, pow: 0.9, fx: "nature/acid-splash" }, { type: "pools", n: 6, radius: 40, dur: 8, pow: 0.35, fx: "nature/toxic-puddle" }, { type: "slam", radius: 90, tel: 1.0, pow: 1.5 }, { type: "summon", monster: "bog_slime", n: 3 }] }),
  rot_queen: B({ name: "부패의 여왕 모르실라", hp: 4800, dmg: 28, speed: 60, look: rig(P.cult, "scythe", "mitre", "#4f2a62", 2),
    patterns: [{ type: "cleave", range: 100, arc: 160, tel: 0.8, pow: 1.6, fx: "melee/scythe-reap" }, { type: "pools", n: 8, radius: 44, dur: 8, pow: 0.4, fx: "nature/poison-cloud" }, { type: "barrage", count: 16, speed: 150, pow: 0.8, fx: "shadow/void-orb" }, { type: "summon", monster: "cultist", n: 2 }, { type: "pull", radius: 220, tel: 1.0, pow: 1.4, phase2: true }] }),
  // 4구역
  magma_golem: B({ name: "마그마 골렘", hp: 5200, dmg: 32, speed: 52, look: rig(P.ember, "hammer", "helm", "#3a1a10", 2.2), mid: true,
    patterns: [{ type: "slam", radius: 110, tel: 1.1, pow: 1.8, fx: "fire/fire-ring" }, { type: "rain", n: 6, radius: 46, tel: 1.2, pow: 1.3, fx: "fire/meteor" }, { type: "charge", dist: 260, width: 50, tel: 1.0, pow: 1.6 }, { type: "pools", n: 5, radius: 40, dur: 7, pow: 0.45, fx: "fire/campfire" }] }),
  furnace_giant: B({ name: "용광로 거인 이그니르", hp: 7600, dmg: 36, speed: 56, look: rig(P.ember, "greatsword", "helm", "#6a2a10", 2.5),
    patterns: [{ type: "cleave", range: 110, arc: 150, tel: 0.9, pow: 1.8, fx: "fire/fire-breath" }, { type: "ring", inner: 70, outer: 190, tel: 1.3, pow: 1.7 }, { type: "rain", n: 8, radius: 48, tel: 1.1, pow: 1.4, fx: "fire/meteor" }, { type: "barrage", count: 18, speed: 170, pow: 0.9, fx: "fire/fireball" }, { type: "beam", dur: 3.5, width: 26, pow: 0.6, phase2: true, fx: "fire/flamethrower" }] }),
  // 5구역
  frost_witch: B({ name: "서리 마녀 일스베", hp: 8200, dmg: 38, speed: 64, look: rig(P.frost, "staff", "hat", "#40709a", 1.8), mid: true,
    patterns: [{ type: "barrage", count: 20, speed: 160, pow: 0.85, fx: "ice/ice-lance" }, { type: "rain", n: 7, radius: 44, tel: 1.1, pow: 1.3, fx: "ice/icicle-fall" }, { type: "ring", inner: 60, outer: 170, tel: 1.2, pow: 1.5, fx: "ice/frost-nova" }, { type: "summon", monster: "snow_wisp", n: 4 }] }),
  frost_lord: B({ name: "서리 군주 발드림", hp: 11500, dmg: 42, speed: 60, look: rig(P.frost, "greatsword", "helm", "#a8d8f0", 2.4),
    patterns: [{ type: "cleave", range: 110, arc: 140, tel: 0.8, pow: 1.8 }, { type: "slam", radius: 120, tel: 1.2, pow: 1.9, fx: "ice/frost-nova", freeze: true }, { type: "charge", dist: 300, width: 50, tel: 0.9, pow: 1.7 }, { type: "rain", n: 9, radius: 46, tel: 1.0, pow: 1.4, fx: "ice/icicle-fall" }, { type: "summon", monster: "frost_knight", n: 2, phase2: true }] }),
  // 6구역
  storm_harpy: B({ name: "폭풍 하피 퀸", hp: 12500, dmg: 44, speed: 90, fly: true, look: critter("critters/bird", ["#101828", "#203a60", "#4070b0", "#90c0f0", "#e0f0ff", "#ffffff"], 2.6), mid: true,
    patterns: [{ type: "charge", dist: 320, width: 46, tel: 0.7, pow: 1.6 }, { type: "rain", n: 8, radius: 42, tel: 1.0, pow: 1.3, fx: "lightning/lightning-strike" }, { type: "aimed", count: 7, spread: 60, speed: 260, pow: 0.9, fx: "lightning/ball-lightning" }, { type: "summon", monster: "storm_wisp", n: 3 }] }),
  thunder_apostle: B({ name: "뇌신의 사도 카이론", hp: 16500, dmg: 48, speed: 66, look: rig(P.storm, "spear", "helm", "#fff070", 2.2),
    patterns: [{ type: "beam", dur: 3.5, width: 24, pow: 0.7, fx: "arcane/arcane-beam" }, { type: "rain", n: 10, radius: 44, tel: 1.0, pow: 1.4, fx: "lightning/lightning-strike" }, { type: "ring", inner: 70, outer: 200, tel: 1.2, pow: 1.7, fx: "lightning/thunderclap" }, { type: "charge", dist: 320, width: 46, tel: 0.8, pow: 1.7 }, { type: "barrage", count: 22, speed: 180, pow: 0.9, fx: "lightning/plasma-ball", phase2: true }] }),
  // 7구역
  fallen_inquisitor: B({ name: "타락 이단심문관", hp: 18000, dmg: 50, speed: 66, look: rig(P.fallen, "hammer", "mitre", "#c8c0d0", 2), mid: true,
    patterns: [{ type: "slam", radius: 120, tel: 1.1, pow: 1.9, fx: "holy/smite" }, { type: "rain", n: 8, radius: 48, tel: 1.1, pow: 1.4, fx: "holy/holy-pillar" }, { type: "cleave", range: 100, arc: 150, tel: 0.8, pow: 1.8 }, { type: "summon", monster: "zealot", n: 2 }] }),
  fallen_archangel: B({ name: "타락한 대천사 세라핀", hp: 23500, dmg: 54, speed: 74, fly: true, look: rig(P.holy, "greatsword", "mitre", "#ffffff", 2.4),
    patterns: [{ type: "barrage", count: 24, speed: 180, pow: 0.9, fx: "projectiles/plasma-shot" }, { type: "rain", n: 10, radius: 50, tel: 1.0, pow: 1.5, fx: "holy/holy-pillar" }, { type: "ring", inner: 80, outer: 210, tel: 1.2, pow: 1.8, fx: "holy/heal-aoe" }, { type: "charge", dist: 340, width: 50, tel: 0.8, pow: 1.8 }, { type: "beam", dur: 4, width: 26, pow: 0.75, fx: "arcane/arcane-beam", phase2: true }] }),
  // 8구역
  clock_warden: B({ name: "태엽 감시자", hp: 25000, dmg: 56, speed: 66, look: rig(P.brass, "spear", "helm", "#40e0ff", 2.2), mid: true,
    patterns: [{ type: "aimed", count: 9, spread: 70, speed: 280, pow: 0.9, fx: "projectiles/laser-bolt" }, { type: "rain", n: 8, radius: 46, tel: 1.0, pow: 1.4, fx: "projectiles/homing-missile" }, { type: "charge", dist: 320, width: 50, tel: 0.8, pow: 1.7 }, { type: "summon", monster: "bomb_bot", n: 3 }] }),
  machine_colossus: B({ name: "기계 거신 오르도", hp: 32000, dmg: 60, speed: 54, look: rig(P.brass, "launcher", "helm", "#c8a050", 2.6),
    patterns: [{ type: "beam", dur: 4, width: 28, pow: 0.8, fx: "scifi/tractor-beam" }, { type: "rain", n: 12, radius: 48, tel: 1.0, pow: 1.5, fx: "explosions/small-explosion" }, { type: "slam", radius: 130, tel: 1.2, pow: 2.0, fx: "scifi/emp-blast" }, { type: "barrage", count: 26, speed: 190, pow: 0.9, fx: "projectiles/laser-bolt" }, { type: "summon", monster: "turret_bot", n: 3, phase2: true }] }),
  // 9구역
  abyss_maw: B({ name: "심연의 아귀", hp: 34000, dmg: 62, speed: 70, look: critter("shadow/void-orb", null, 1.6), mid: true,
    patterns: [{ type: "pull", radius: 260, tel: 1.0, pow: 1.6 }, { type: "barrage", count: 24, speed: 170, pow: 0.9, fx: "shadow/void-orb" }, { type: "pools", n: 7, radius: 46, dur: 8, pow: 0.5, fx: "shadow/shadow-flames" }, { type: "summon", monster: "skull", n: 4 }] }),
  abyss_eye: B({ name: "심연의 눈 아자토르", hp: 43000, dmg: 66, speed: 60, fly: true, look: critter("critters/eyeball", null, 3),
    patterns: [{ type: "beam", dur: 4.5, width: 30, pow: 0.85, fx: "arcane/arcane-beam" }, { type: "barrage", count: 30, speed: 180, pow: 0.9, fx: "shadow/void-orb" }, { type: "rain", n: 12, radius: 50, tel: 1.0, pow: 1.5, fx: "shadow/grasping-hands" }, { type: "ring", inner: 80, outer: 220, tel: 1.2, pow: 1.9, fx: "shadow/dark-explosion" }, { type: "summon", monster: "eyeball", n: 3, phase2: true }] }),
  // 10구역
  chaos_knight: B({ name: "혼돈의 기사 모르드", hp: 46000, dmg: 70, speed: 76, look: rig(P.royal, "greatsword", "helm", "#5a0a1a", 2.2), mid: true,
    patterns: [{ type: "cleave", range: 120, arc: 160, tel: 0.7, pow: 2.0 }, { type: "charge", dist: 360, width: 52, tel: 0.7, pow: 1.9 }, { type: "rain", n: 10, radius: 50, tel: 1.0, pow: 1.5, fx: "arcane/star-fall" }, { type: "summon", monster: "royal_guard", n: 2 }] }),
  dungeon_king: B({ name: "던전의 왕 바엘제논", hp: 60000, dmg: 76, speed: 66, look: rig(P.royal, "scythe", "mitre", "#ffd860", 2.6), xp: 60,
    patterns: [{ type: "cleave", range: 130, arc: 170, tel: 0.8, pow: 2.0, fx: "melee/scythe-reap" }, { type: "ring", inner: 80, outer: 230, tel: 1.2, pow: 2.0, fx: "shadow/dark-explosion" }, { type: "rain", n: 14, radius: 52, tel: 1.0, pow: 1.6, fx: "fire/meteor" }, { type: "barrage", count: 32, speed: 190, pow: 1.0, fx: "arcane/arcane-orb" }, { type: "beam", dur: 5, width: 30, pow: 0.9, fx: "arcane/arcane-beam", phase2: true }, { type: "summon", monster: "chaos_hound", n: 4, phase2: true }] }),
  // 제2 던전 보스: 패턴을 겹치고 안전지대를 빠르게 바꾸는 고난도 설계
  rift_harbinger: B({ name: "균열의 선도자 베르칸", hp: 18000, dmg: 62, speed: 82, look: rig(RIFT, "greatsword", "helm", "#491a2b", 2.2), mid: true,
    patterns: [{ type: "cross", len: 380, width: 42, tel: 0.85, pow: 1.55, fx: "melee/spear-sweep" }, { type: "rain", n: 9, radius: 48, tel: 0.9, pow: 1.45, fx: "fire/meteor" }, { type: "pull", radius: 245, tel: 0.85, pow: 1.5 }, { type: "summon", monster: "crimson_hunter", n: 3, phase2: true }] }),
  scarlet_regent: B({ name: "진홍의 섭정 아르카디아", hp: 52000, dmg: 88, speed: 78, look: rig(RIFT, "scythe", "mitre", "#491a2b", 2.65),
    patterns: [{ type: "donut", inner: 105, outer: 255, tel: 0.95, pow: 1.65, fx: "shadow/dark-explosion" }, { type: "lanes", n: 7, width: 42, len: 390, tel: 0.8, pow: 1.45, fx: "fire/fire-ring" }, { type: "spiral", arms: 4, dur: 2.4, speed: 205, pow: 1.0, fx: "shadow/void-orb" }, { type: "beam", dur: 4.2, width: 34, pow: 0.95, fx: "fire/flamethrower", phase2: true }, { type: "summon", monster: "shard_mimic", n: 4, phase2: true }, { type: "pools", n: 7, radius: 42, dur: 7, pow: 0.55, fx: "shadow/shadow-flames", phase2: true }] }),
  null_archivist: B({ name: "무효의 기록관", hp: 26000, dmg: 74, speed: 70, look: rig(CHRONO, "staff", "hat", "#1b3a58", 2.15), mid: true,
    patterns: [{ type: "lanes", n: 8, width: 38, len: 430, tel: 0.75, pow: 1.5, fx: "lightning/lightning-strike" }, { type: "barrage", count: 26, speed: 215, pow: 1.0, fx: "projectiles/laser-bolt" }, { type: "spiral", arms: 3, dur: 2.6, speed: 195, pow: 0.95, fx: "arcane/arcane-orb" }, { type: "summon", monster: "null_automaton", n: 2, phase2: true }] }),
  paradox_engine: B({ name: "역행의 심장 크로노스", hp: 72000, dmg: 98, speed: 72, look: critter("scifi/energy-core", ["#061522", "#12445c", "#2b8caa", "#65d9e5", "#d0ffff", "#ffffff"], 3.0),
    patterns: [{ type: "cross", len: 420, width: 38, tel: 0.8, pow: 1.55, fx: "scifi/emp-blast" }, { type: "ring", inner: 90, outer: 250, tel: 1.0, pow: 1.75, fx: "lightning/thunderclap" }, { type: "rain", n: 13, radius: 48, tel: 0.85, pow: 1.55, fx: "projectiles/homing-missile" }, { type: "beam", dur: 4.8, width: 32, pow: 0.95, fx: "scifi/tractor-beam", phase2: true }, { type: "chase", n: 5, gap: 0.38, radius: 52, tel: 0.7, pow: 1.15, fx: "impacts/ground-slam", phase2: true }, { type: "summon", monster: "paradox_marksman", n: 3, phase2: true }] }),
  eclipse_warden: B({ name: "일식의 감시자", hp: 34000, dmg: 82, speed: 80, look: rig(ECLIPSE, "spear", "helm", "#10091f", 2.3), mid: true,
    patterns: [{ type: "pull", radius: 275, tel: 0.75, pow: 1.65 }, { type: "donut", inner: 95, outer: 245, tel: 0.9, pow: 1.7, fx: "shadow/dark-explosion" }, { type: "barrage", count: 28, speed: 210, pow: 1.0, fx: "shadow/void-orb" }, { type: "summon", monster: "void_stalker", n: 4, phase2: true }] }),
  void_emperor: B({ name: "별을 삼킨 황제 에레보스", hp: 98000, dmg: 112, speed: 76, look: rig(ECLIPSE, "scythe", "mitre", "#10091f", 2.85), xp: 80,
    patterns: [{ type: "cross", len: 440, width: 42, tel: 0.75, pow: 1.7, fx: "shadow/dark-explosion" }, { type: "lanes", n: 9, width: 38, len: 440, tel: 0.75, pow: 1.55, fx: "shadow/shadow-flames" }, { type: "spiral", arms: 4, dur: 2.8, speed: 220, pow: 1.05, fx: "arcane/arcane-orb" }, { type: "donut", inner: 110, outer: 270, tel: 0.9, pow: 1.85, fx: "shadow/dark-explosion", phase2: true }, { type: "beam", dur: 5.2, width: 38, pow: 1.05, fx: "arcane/arcane-beam", phase2: true }, { type: "summon", monster: "star_eater", n: 4, phase2: true }, { type: "pools", n: 9, radius: 45, dur: 8, pow: 0.65, fx: "shadow/shadow-flames", phase2: true }] }),
  abyss_watcher: B({ name: "심연의 감시자", hp: 145000, dmg: 128, speed: 78, look: rig(ECLIPSE, "scythe", "helm", "#10091f", 3.0), xp: 110,
    patterns: [
      { type: "cross", len: 460, width: 42, tel: 1.25, pow: 1.8, fx: "shadow/dark-explosion" },
      { type: "rain", n: 12, radius: 52, tel: 1.2, pow: 1.65, fx: "arcane/star-fall" },
      { type: "donut", inner: 112, outer: 280, tel: 1.3, pow: 1.9, fx: "shadow/shadow-flames" },
      { type: "lanes", n: 8, width: 44, len: 460, tel: 1.15, pow: 1.7, fx: "lightning/lightning-strike", phase2: true },
      { type: "beam", dur: 4.8, width: 34, pow: 1.0, fx: "arcane/arcane-beam", phase2: true },
      { type: "summon", monster: "rift_wraith", n: 3, phase2: true },
      { type: "pools", n: 8, radius: 46, dur: 7, pow: 0.6, fx: "nature/spore-burst", phase2: true }
    ] }),
};

// 구역 정의: 팔레트(바닥·벽), 조명, 분위기 이펙트
export const ZONES = [
  { name: "이끼 낀 지하묘지", floor: ["#3a4038", "#323830", "#2a2f28", "#454c40"], wall: ["#5a5e52", "#43473c", "#2c2f27", "#1a1c17"], accent: "#6fa060", light: 150, ambient: 0.82, torch: "fire/torch",
    monsters: ["slime", "bat", "slime", "bat", "skeleton", "skel_archer"], mid: "giant_slime", boss: "skeleton_lord", weather: null, deco: ["bones", "moss", "crack"] },
  { name: "고블린 굴", floor: ["#4a3a2c", "#40322a", "#362a22", "#544232"], wall: ["#6a5440", "#524030", "#3a2c20", "#221810"], accent: "#c08040", light: 145, ambient: 0.84, torch: "fire/brazier",
    monsters: ["goblin", "goblin_spear", "goblin_shaman", "wolf"], mid: "goblin_chief", boss: "ogre_king", weather: null, deco: ["bones", "crate", "crack"] },
  { name: "독버섯 늪", floor: ["#2e3a2a", "#283424", "#222c1e", "#364430"], wall: ["#3e4a34", "#2e3826", "#20281a", "#12180e"], accent: "#a0d040", light: 140, ambient: 0.86, torch: "fire/spirit-flame",
    monsters: ["toad", "bog_slime", "cultist", "snake"], mid: "rot_matron", boss: "rot_queen", weather: "weather/fog", deco: ["mushroom", "moss", "puddle"] },
  { name: "화염 용광로", floor: ["#3a2a26", "#32241f", "#2a1d19", "#46302a"], wall: ["#5a3a30", "#452c24", "#2e1c17", "#1a0e0a"], accent: "#ff7030", light: 170, ambient: 0.78, torch: "fire/brazier",
    monsters: ["imp", "ember_knight", "magma_slime", "forge_brute"], mid: "magma_golem", boss: "furnace_giant", weather: null, deco: ["lava", "crack", "anvil"] },
  { name: "얼어붙은 성채", floor: ["#3c4a58", "#34404c", "#2c3640", "#465666"], wall: ["#6a8098", "#50647a", "#38485a", "#20283a"], accent: "#a0e0ff", light: 150, ambient: 0.8, torch: "fire/spirit-flame",
    monsters: ["wraith", "frost_knight", "ice_archer", "snow_wisp"], mid: "frost_witch", boss: "frost_lord", weather: "weather/snow", deco: ["ice", "crack", "banner"] },
  { name: "폭풍 첨탑", floor: ["#38384c", "#303042", "#282838", "#424258"], wall: ["#5a5a7a", "#464664", "#32324a", "#1c1c2e"], accent: "#fff070", light: 150, ambient: 0.82, torch: "lightning/tesla-coil",
    monsters: ["storm_wisp", "storm_guard", "tempest_mage", "jelly"], mid: "storm_harpy", boss: "thunder_apostle", weather: "weather/storm", deco: ["rune", "crack", "banner"] },
  { name: "타락한 성역", floor: ["#4a4438", "#403a30", "#363028", "#585040"], wall: ["#8a8070", "#6e6658", "#524c40", "#2e2a22"], accent: "#ffe8a0", light: 160, ambient: 0.8, torch: "fire/candle",
    monsters: ["fallen_paladin", "zealot", "halo_wisp", "fallen_blade"], mid: "fallen_inquisitor", boss: "fallen_archangel", weather: "weather/god-rays", deco: ["candle", "banner", "crack"] },
  { name: "태엽 공장", floor: ["#3a3632", "#322e2a", "#2a2622", "#44403a"], wall: ["#6a5a40", "#544630", "#3c3222", "#221c12"], accent: "#40e0ff", light: 160, ambient: 0.8, torch: "scifi/energy-core",
    monsters: ["automaton", "turret_bot", "saw_bot", "bomb_bot"], mid: "clock_warden", boss: "machine_colossus", weather: null, deco: ["gear", "crate", "pipe"] },
  { name: "그림자 심연", floor: ["#26222e", "#201c28", "#1a1622", "#2e2a38"], wall: ["#3e3650", "#2e2840", "#201c2e", "#100c18"], accent: "#c040ff", light: 125, ambient: 0.9, torch: "shadow/shadow-flames",
    monsters: ["eyeball", "skull", "shade", "void_caller"], mid: "abyss_maw", boss: "abyss_eye", weather: "weather/fog", deco: ["rune", "bones", "crack"] },
  { name: "혼돈의 왕좌", floor: ["#3a2026", "#321a20", "#2a151a", "#46262e"], wall: ["#6a3a40", "#542c32", "#3c1e24", "#220e12"], accent: "#ffd860", light: 150, ambient: 0.86, torch: "fire/brazier",
    monsters: ["royal_guard", "royal_archer", "chaos_mage", "chaos_hound"], mid: "chaos_knight", boss: "dungeon_king", weather: "weather/shooting-stars", deco: ["banner", "candle", "crack"] },
];

// 제2 던전: 30층 독립 진행. 10층마다 환경·몬스터·보스가 모두 교체된다.
export const DUNGEON2_ZONES = [
  { name: "붉은 균열", floor: ["#38212a", "#301a24", "#24131e", "#482633"], wall: ["#7a394a", "#5a2638", "#3a1a2a", "#180b16"], accent: "#ff647d", light: 118, ambient: 0.92, torch: "shadow/shadow-flames",
    monsters: ["rift_guard", "blood_wisp", "crimson_hunter", "shard_mimic", "resonance_tracker", "shard_golem"], mid: "rift_harbinger", boss: "scarlet_regent", weather: "weather/fog", deco: ["crack", "bones", "rune"] },
  { name: "정지한 시계도시", floor: ["#1c3038", "#172832", "#11212c", "#29434a"], wall: ["#3a7380", "#2a5668", "#1a3a4c", "#0b1722"], accent: "#65d9e5", light: 130, ambient: 0.88, torch: "scifi/energy-core",
    monsters: ["null_automaton", "paradox_marksman", "chrono_sentinel", "hex_oracle", "rift_wraith", "abyss_sorcerer"], mid: "null_archivist", boss: "paradox_engine", weather: "weather/storm", deco: ["gear", "rune", "crack"] },
  { name: "별 없는 심연", floor: ["#20182e", "#1a1428", "#120d20", "#2b2040"], wall: ["#59417e", "#3c2b60", "#251a42", "#0e081a"], accent: "#c18aff", light: 105, ambient: 0.95, torch: "shadow/shadow-flames",
    monsters: ["void_stalker", "eclipse_cultist", "star_eater", "abyss_mirror", "poison_spore", "resonance_tracker", "shard_golem"], mid: "eclipse_warden", boss: "abyss_watcher", weather: "weather/fog", deco: ["rune", "bones", "crack"] },
];
export const DUNGEON2_MAX_FLOOR = 30;
export function zoneOf(floor, dungeon = 1) {
  const list = dungeon === 2 ? DUNGEON2_ZONES : ZONES;
  return list[Math.min(list.length - 1, Math.floor((floor - 1) / 10))];
}
/** 층 종류: normal | mid(5의 배수, 10의 배수 제외) | boss(10의 배수) */
export function floorKind(floor) {
  if (floor % 10 === 0) return "boss";
  if (floor % 5 === 0) return "mid";
  return "normal";
}
/** 층 배율: 플레이어 성장 곡선(레벨≈층)에 맞춘 전역 곡선 */
// 60층까지는 기존 곡선, 그 뒤로는 완만하게 (후반 벽 완화)
const bend = (base, late, f) => f <= 60 ? Math.pow(base, f - 1) : Math.pow(base, 59) * Math.pow(late, f - 60);
// 추가 난이도: 층마다 체력 +2.5%·공격력 +1.6%씩 더 강해짐 (1층 그대로, 10층 ×1.23/×1.14, 50층 ×2.2/×1.8, 100층 ×3.5/×2.6), 이동 속도 최대 +25%
export const diffMul = (f) => ({ hp: 1 + 0.025 * (f - 1), dmg: 1 + 0.016 * (f - 1), speed: Math.min(1.25, 1 + 0.003 * (f - 1)) });
// 95층부터는 너무 어렵다는 의견 → 체력·공격력 75%
export const LATE_EASE = (f) => (f >= 95 ? 0.75 : 1);
// ── 제2 던전 난이도 (대폭 상향)
//  예전: 층 번호 1~30을 그대로 써서 '제1 던전 1~30층 ×5' → 레벨 100 이상에게는 1층이 제1 던전 100층보다 10배 쉬웠고,
//        몬스터 레벨이 1~30이라 방어력이 피해를 거의 다 막았으며, 드롭 아이템도 1~30레벨짜리였음.
//  지금: 제2 던전 n층 = 실제 레벨 100 + n×5/3 (1층 102 → 30층 150).
//        체력·공격력은 '제1 던전 100층' 기준 1층부터 체력 ×2.5 · 공격력 ×1.8, 층마다 체력 +3% · 공격력 +1.8% (30층: ×4.7 · ×2.7)
export const D2_HARD = { hp: 2.5, dmg: 1.8, hpStep: 0.03, dmgStep: 0.018, speed: 1.1 };
export const d2Level = (floor) => 100 + Math.round((floor * 5) / 3);
/** 그 층의 실제 레벨 (제1 던전은 층 = 레벨) */
export const effLevel = (floor, dungeon = 1) => (dungeon === 2 ? d2Level(floor) : floor);
export function floorScale(floor, dungeon = 1) {
  if (dungeon === 2) {
    const b = floorScale(100, 1), n = Math.max(0, floor - 1), L = d2Level(floor);
    return {
      hp: b.hp * D2_HARD.hp * (1 + D2_HARD.hpStep * n),
      dmg: b.dmg * D2_HARD.dmg * (1 + D2_HARD.dmgStep * n),
      speed: b.speed * D2_HARD.speed,
      xp: Math.pow(1.045, L - 1) * 1.5,
      gold: Math.pow(1.04, L - 1) * 1.3,
      level: L,
    };
  }
  const d = diffMul(floor), e = LATE_EASE(floor);
  return {
    hp: bend(1.05, 1.04, floor) * d.hp * e,
    dmg: bend(1.04, 1.027, floor) * d.dmg * e,
    speed: d.speed,
    xp: Math.pow(1.045, floor - 1),
    gold: Math.pow(1.04, floor - 1),
    level: floor,
  };
}

// 구역마다 데이터 숫자의 평균을 1구역 기준으로 정규화 → 구역 안 상대 차이(궁수는 약하고 기사는 단단함)만 남김
const avg = (zi, k, list = ZONES) => {
  const ids = list[zi].monsters;
  return ids.reduce((s, id) => s + MONSTERS[id][k], 0) / ids.length;
};
const normFor = (list) => list.map((_, zi) => ({ hp: avg(zi, "hp", list) / avg(0, "hp", list), dmg: avg(zi, "dmg", list) / avg(0, "dmg", list) }));
const NORM = normFor(ZONES);
const DUNGEON2_NORM = normFor(DUNGEON2_ZONES);
// 제2 던전 데이터는 원래 숫자가 커서(평균 체력 약 5배) 그대로 쓰면 난이도가 데이터 크기에 따라 들쭉날쭉 → 제1 던전 기준으로 맞춤
const D2_FIX = { hp: avg(0, "hp", ZONES) / avg(0, "hp", DUNGEON2_ZONES), dmg: avg(0, "dmg", ZONES) / avg(0, "dmg", DUNGEON2_ZONES) };

/** 몬스터·보스 체력 배율: 혼자 3.5배, 파티 7.5배. 초반은 1층 1배 → 10층에서 최대치까지 서서히 (신규 유저 보호) */
export const SOLO_HP = 3.5, PARTY_HP = 7.5;
const hpBoost = (party, floor) => { const max = party > 1 ? PARTY_HP : SOLO_HP; return 1 + (max - 1) * Math.min(1, Math.max(0, (floor - 1) / 9)); };
/** 층에 맞춘 실제 몬스터 능력치 */
export function monsterStats(id, floor, party = 1, dungeon = 1) {
  const def = MONSTERS[id];
  const list = dungeon === 2 ? DUNGEON2_ZONES : ZONES;
  const norm = dungeon === 2 ? DUNGEON2_NORM : NORM;
  const zi = Math.min(list.length - 1, Math.floor((floor - 1) / 10));
  const s = floorScale(floor, dungeon);
  const pScale = 1 + 0.55 * (party - 1);
  const L = effLevel(floor, dungeon), fx = dungeon === 2 ? D2_FIX : { hp: 1, dmg: 1 };
  return {
    hp: Math.round((def.hp / norm[zi].hp) * fx.hp * s.hp * pScale * hpBoost(party, L)),
    dmg: (def.dmg / norm[zi].dmg) * fx.dmg * s.dmg,
    xp: def.xp * 6 * s.xp,
    level: L,
  };
}
/** 보스 능력치: 중간보스는 평균 몬스터의 36배, 주요 보스는 64배 체력 */
export function bossStats(id, floor, party = 1, dungeon = 1) {
  const def = BOSSES[id];
  const list = dungeon === 2 ? DUNGEON2_ZONES : ZONES;
  const s = floorScale(floor, dungeon);
  const baseHp = avg(0, "hp", ZONES) * s.hp, baseDmg = avg(0, "dmg", ZONES) * s.dmg; // 두 던전 모두 같은 기준값
  const pScale = 1 + 0.7 * (party - 1);
  const hpMul = def.mid ? 36 : 64;
  const capBonus = dungeon === 1 && floor >= 100 ? 1.5 : 1;
  return {
    hp: Math.round(baseHp * hpMul * pScale * capBonus * (dungeon === 2 && floor >= DUNGEON2_MAX_FLOOR ? 1.5 : 1) * hpBoost(party, effLevel(floor, dungeon))),
    dmg: baseDmg * (def.mid ? 1.5 : 1.7),
    xp: (def.xp ?? 25) * 6 * s.xp,
    level: effLevel(floor, dungeon),
  };
}
