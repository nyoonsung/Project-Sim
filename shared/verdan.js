// 베르단 섬 던전 데이터 (2차 업데이트 3·4·9장)
//  제1 던전(dungeon 3): 100층, 10층마다 구역 교체. 5층 중간보스는 구역 기믹을 가르치고 10층 주요 보스가 조합한다.
//  제2 던전(dungeon 4): 30층 「기억왕의 지하왕릉」. 1~10 석관 웨이브, 11~20 지연·반복 예고, 21~30 역상 문양·이동 안전 지대.
//  hp·dmg 는 구역 안에서의 상대값(구역 평균으로 정규화됨), 실제 수치는 shared/zones.js 의 층 배율로 정해진다.

const rig = (pal, weapon, head = null, headColor = null, scale = 1) => ({ rig: { ...pal, weapon, head, headColor }, scale });
const critter = (fx, palette, scale = 1) => ({ critter: fx, palette, scale });
const pal = (a, c, mark) => ({ armor: a, core: c, mark });
const B = (o) => ({ boss: true, xp: 40, ...o });

// 팔레트 (구역별)
const ERODE = pal(["#b8a8b0", "#8a7884", "#5e4e5c", "#382c38"], ["#3a2c34", "#281e26", "#160f16"], "#ff8a5a");
const SNOWV = pal(["#f4f8ff", "#c8d4e8", "#8a9ab8", "#56627e"], ["#3a4660", "#283248", "#161c2c"], "#9ae0ff");
const ASTRO = pal(["#c8d0ff", "#8a94d8", "#545ea0", "#2e3468"], ["#1c2048", "#121634", "#0a0c1e"], "#ffe070");
const DEEP = pal(["#9ae8e0", "#5ab8b0", "#2e7e80", "#164448"], ["#0e3a42", "#08262e", "#04141a"], "#70ffd8");
const GLASS = pal(["#f0fcff", "#b8eef8", "#78c8e0", "#3e8aa8"], ["#2a6078", "#1a4258", "#0c2434"], "#ffffff");
const GROVE = pal(["#a8e080", "#6ab048", "#3e7a2a", "#1e4a16"], ["#3a2a14", "#281c0c", "#160f06"], "#e0ff70");
const TEMPEST = pal(["#d8d0ff", "#9a8ae8", "#5e50b0", "#342a70"], ["#1c1848", "#120f34", "#08061c"], "#fff070");
const COG = pal(["#f0c890", "#c09050", "#8a6030", "#503414"], ["#2a5058", "#1a383e", "#0c2024"], "#60f0ff");
const STARLESS = pal(["#7a6a9a", "#544670", "#342a4c", "#1c162c"], ["#0c0816", "#06040e", "#020106"], "#d070ff");
const HEART = pal(["#ffb0a0", "#e06a5a", "#a03a34", "#5a1a1c"], ["#3a0a12", "#28060c", "#140306"], "#ffe08a");
const TOMB = pal(["#e8d8b0", "#bca878", "#8a7a50", "#544a2c"], ["#1e4a48", "#123432", "#081c1a"], "#5affe0");
const COURT = pal(["#e8e0f8", "#b4a8d8", "#7a6ea8", "#463e6a"], ["#2a1e48", "#1c1434", "#0e0a1c"], "#ff9ae0");
const THRONE = pal(["#2a2418", "#4a4028", "#8a7440", "#d8b860"], ["#f0e0b0", "#c8b080", "#907a50"], "#ff3050");

const G = (cols) => cols; // 생물 팔레트 가독성용
const P_ROT = G(["#140c12", "#3a2030", "#6a3a50", "#a8687a", "#e8b8c0", "#ffffff"]);
const P_ICE = G(["#061420", "#183a5a", "#4a80b0", "#9ad0f0", "#eaf8ff", "#ffffff"]);
const P_STAR = G(["#0a0a24", "#202060", "#4a4ab0", "#9a9af0", "#e8e8ff", "#ffffff"]);
const P_SEA = G(["#021418", "#0a3a40", "#1a7a78", "#4ad0c0", "#b0fff0", "#ffffff"]);
const P_GLASS = G(["#0a2030", "#2a6a88", "#6ac0e0", "#b8f0ff", "#f4ffff", "#ffffff"]);
const P_LEAF = G(["#081806", "#1a4410", "#3a8a20", "#80d050", "#d8ff98", "#ffffff"]);
const P_BOLT = G(["#100c28", "#302878", "#6a5ad0", "#b0a8ff", "#fff8a0", "#ffffff"]);
const P_BRASS = G(["#1a1008", "#5a3a14", "#a87830", "#f0c060", "#fff0c0", "#ffffff"]);
const P_VOID = G(["#040208", "#1a0c2a", "#40206a", "#8a4ac0", "#e0a8ff", "#ffffff"]);
const P_BLOOD = G(["#200406", "#5a1018", "#a82a30", "#f06a5a", "#ffd0b0", "#ffffff"]);
const P_TOMB = G(["#0a1414", "#1e3a38", "#3a7a70", "#7ad0b8", "#d0fff0", "#ffffff"]);
const P_MEM = G(["#140a20", "#3a2060", "#7048b0", "#c090f0", "#f8e0ff", "#ffffff"]);

export const VERDAN_MONSTERS = {
  // 1구역 침식된 변경 지대
  v_rust_warden: { name: "침식된 변경수비대", ai: "chaser", hp: 240, dmg: 46, speed: 76, range: 42, atkCd: 1.3, xp: 7.0, look: rig(ERODE, "spear", "helm", "#5e4e5c", 1.05) },
  v_ash_hound: { name: "잿빛 들개", ai: "swarm", hp: 150, dmg: 38, speed: 150, range: 24, atkCd: 0.85, xp: 6.0, look: critter("critters/snake", P_ROT, 1.15) },
  v_rot_slinger: { name: "부식 투척병", ai: "ranged", hp: 170, dmg: 44, speed: 70, range: 250, atkCd: 1.6, xp: 6.6, proj: "nature/acid-splash", projSmall: true, poison: true, look: rig(ERODE, "bow", "hood", "#382c38") },
  v_blight_ooze: { name: "침식 점액", ai: "bomber", hp: 190, dmg: 62, speed: 84, range: 30, atkCd: 1.05, xp: 6.4, look: critter("critters/slime", P_ROT, 1.15) },
  v_scrap_brute: { name: "고철 파쇄자", ai: "guard", hp: 420, dmg: 70, speed: 46, range: 54, atkCd: 2.6, xp: 8.0, look: rig(ERODE, "hammer", "helm", "#382c38", 1.3) },
  // 2구역 망각의 설원
  v_frost_reaver: { name: "망각의 설원 약탈자", ai: "charger", hp: 230, dmg: 52, speed: 92, range: 44, atkCd: 2.0, xp: 7.2, look: rig(SNOWV, "greatsword", "helm", "#56627e", 1.05) },
  v_white_wisp: { name: "흰 망각 정령", ai: "blink", hp: 180, dmg: 50, speed: 104, range: 30, atkCd: 1.1, xp: 6.8, fly: true, look: critter("critters/wisp", P_ICE, 1.1) },
  v_rime_caster: { name: "서리 망각술사", ai: "caster", hp: 200, dmg: 56, speed: 64, range: 250, atkCd: 2.5, xp: 7.4, aoe: "ice/ice-spikes", look: rig(SNOWV, "staff", "hat", "#8a9ab8") },
  v_snow_stalker: { name: "눈보라 추적자", ai: "stalker", hp: 220, dmg: 54, speed: 150, range: 28, atkCd: 1.0, xp: 7.2, look: rig(SNOWV, "dagger", "hood", "#c8d4e8", 0.95) },
  v_glacier_shell: { name: "빙하 등껍질", ai: "guard", hp: 440, dmg: 72, speed: 42, range: 56, atkCd: 2.8, xp: 8.2, look: critter("critters/frog", P_ICE, 1.6) },
  // 3구역 봉인된 천문대
  v_orrery_guard: { name: "천문대 봉인병", ai: "chaser", hp: 260, dmg: 54, speed: 74, range: 44, atkCd: 1.25, xp: 7.6, look: rig(ASTRO, "spear", "helm", "#2e3468", 1.05) },
  v_star_scribe: { name: "성도 기록관", ai: "summoner", hp: 240, dmg: 56, speed: 60, range: 245, atkCd: 2.5, xp: 8.0, aoe: "arcane/star-fall", summon: "v_comet_mote", look: rig(ASTRO, "staff", "mitre", "#545ea0") },
  v_comet_mote: { name: "혜성 파편", ai: "swarm", hp: 150, dmg: 46, speed: 156, range: 24, atkCd: 0.9, xp: 6.0, fly: true, look: critter("critters/wisp", P_STAR, 0.95) },
  v_lens_sniper: { name: "렌즈 저격수", ai: "ranged", hp: 190, dmg: 60, speed: 66, range: 280, atkCd: 1.5, xp: 7.4, proj: "projectiles/laser-bolt", look: rig(ASTRO, "bow", "hood", "#1c2048") },
  v_seal_eye: { name: "봉인의 눈", ai: "spore", hp: 300, dmg: 52, speed: 46, range: 230, atkCd: 2.7, xp: 8.0, aoe: "arcane/rune-circle", fly: true, look: critter("critters/eyeball", P_STAR, 1.25) },
  // 4구역 가라앉은 항구와 해저 유적
  v_drowned_sailor: { name: "익사한 선원", ai: "chaser", hp: 270, dmg: 56, speed: 78, range: 42, atkCd: 1.25, xp: 7.8, look: rig(DEEP, "scythe", "cap", "#164448", 1.0) },
  v_reef_jelly: { name: "산호 해파리", ai: "bomber", hp: 220, dmg: 74, speed: 86, range: 32, atkCd: 1.0, xp: 7.4, fly: true, look: critter("critters/jellyfish", P_SEA, 1.15) },
  v_tide_harpooner: { name: "조수 작살수", ai: "charger", hp: 250, dmg: 60, speed: 94, range: 46, atkCd: 2.0, xp: 7.8, look: rig(DEEP, "spear", "hood", "#0e3a42") },
  v_abyss_angler: { name: "심해 아귀", ai: "ranged", hp: 230, dmg: 60, speed: 70, range: 260, atkCd: 1.5, xp: 7.6, proj: "water/water-orb", projSmall: true, look: critter("critters/frog", P_SEA, 1.3) },
  v_ruin_sentinel: { name: "해저 유적 파수꾼", ai: "guard", hp: 460, dmg: 76, speed: 44, range: 56, atkCd: 2.7, xp: 8.6, look: rig(DEEP, "hammer", "helm", "#2e7e80", 1.35) },
  // 5구역 유리 사막
  v_glass_scorpion: { name: "유리 전갈", ai: "charger", hp: 260, dmg: 64, speed: 98, range: 44, atkCd: 1.9, xp: 8.0, poison: true, look: critter("critters/snake", P_GLASS, 1.25) },
  v_mirage_dancer: { name: "신기루 무희", ai: "blink", hp: 220, dmg: 62, speed: 108, range: 30, atkCd: 1.05, xp: 7.8, look: rig(GLASS, "dagger", "hood", "#78c8e0", 0.95) },
  v_prism_caster: { name: "프리즘 술사", ai: "caster", hp: 230, dmg: 64, speed: 62, range: 255, atkCd: 2.4, xp: 8.0, aoe: "ice/ice-shatter", look: rig(GLASS, "staff", "hat", "#3e8aa8") },
  v_sand_shard: { name: "모래 유리 파편", ai: "swarm", hp: 170, dmg: 54, speed: 160, range: 24, atkCd: 0.85, xp: 6.8, fly: true, look: critter("projectiles/energy-disc", P_GLASS, 0.75) },
  v_glass_colossus: { name: "유리 거상", ai: "guard", hp: 480, dmg: 80, speed: 42, range: 58, atkCd: 2.8, xp: 9.0, look: rig(GLASS, "greatsword", "helm", "#b8eef8", 1.4) },
  // 6구역 잠든 원시림
  v_thorn_beast: { name: "가시 맹수", ai: "swarm", hp: 200, dmg: 58, speed: 156, range: 26, atkCd: 0.85, xp: 7.4, look: critter("critters/snake", P_LEAF, 1.3) },
  v_root_shaman: { name: "뿌리 주술사", ai: "caster", hp: 240, dmg: 64, speed: 60, range: 250, atkCd: 2.5, xp: 8.2, aoe: "nature/root-snare", look: rig(GROVE, "staff", "mitre", "#1e4a16") },
  v_spore_mother: { name: "포자 어미", ai: "spore", hp: 330, dmg: 58, speed: 46, range: 230, atkCd: 2.6, xp: 8.6, aoe: "nature/spore-burst", look: critter("critters/slime", P_LEAF, 1.35) },
  v_grove_ranger: { name: "원시림 순찰자", ai: "ranged", hp: 230, dmg: 64, speed: 72, range: 270, atkCd: 1.45, xp: 8.0, proj: "projectiles/arrow", look: rig(GROVE, "bow", "hood", "#3e7a2a") },
  v_elder_treant: { name: "잠든 고목 수호자", ai: "guard", hp: 500, dmg: 82, speed: 40, range: 58, atkCd: 2.8, xp: 9.2, look: rig(GROVE, "hammer", "helm", "#3a2a14", 1.45) },
  // 7구역 폭풍의 첨탑
  v_storm_lancer: { name: "폭풍 창기병", ai: "charger", hp: 270, dmg: 66, speed: 100, range: 46, atkCd: 1.9, xp: 8.4, look: rig(TEMPEST, "spear", "helm", "#342a70", 1.05) },
  v_volt_wisp: { name: "전압 정령", ai: "ranged", hp: 220, dmg: 64, speed: 96, range: 250, atkCd: 1.35, xp: 8.0, proj: "lightning/ball-lightning", projSmall: true, fly: true, look: critter("critters/wisp", P_BOLT, 1.05) },
  v_thunder_priest: { name: "뇌우 사제", ai: "summoner", hp: 260, dmg: 66, speed: 60, range: 250, atkCd: 2.4, xp: 8.6, aoe: "lightning/lightning-strike", summon: "v_volt_wisp", look: rig(TEMPEST, "staff", "mitre", "#5e50b0") },
  v_gale_blade: { name: "질풍 검귀", ai: "stalker", hp: 250, dmg: 64, speed: 158, range: 28, atkCd: 0.95, xp: 8.2, look: rig(TEMPEST, "sword", "hood", "#1c1848") },
  v_spire_golem: { name: "첨탑 피뢰 골렘", ai: "guard", hp: 520, dmg: 84, speed: 40, range: 58, atkCd: 2.7, xp: 9.4, look: rig(TEMPEST, "hammer", "helm", "#9a8ae8", 1.45) },
  // 8구역 뒤틀린 시계 유적
  v_gear_knight: { name: "톱니 기사", ai: "chaser", hp: 290, dmg: 66, speed: 76, range: 44, atkCd: 1.2, xp: 8.6, look: rig(COG, "greatsword", "helm", "#503414", 1.05) },
  v_tick_bomb: { name: "초침 폭탄", ai: "bomber", hp: 230, dmg: 82, speed: 90, range: 32, atkCd: 1.0, xp: 8.0, look: critter("scifi/energy-core", P_BRASS, 0.55) },
  v_rewind_seer: { name: "역행 예언자", ai: "caster", hp: 250, dmg: 68, speed: 62, range: 255, atkCd: 2.3, xp: 8.8, aoe: "arcane/time-stop", look: rig(COG, "staff", "hat", "#2a5058") },
  v_pendulum: { name: "진자 칼날", ai: "blink", hp: 240, dmg: 66, speed: 110, range: 32, atkCd: 1.05, xp: 8.4, fly: true, look: critter("projectiles/energy-disc", P_BRASS, 0.95) },
  v_clock_turret: { name: "시계탑 포대", ai: "ranged", hp: 260, dmg: 68, speed: 64, range: 280, atkCd: 1.4, xp: 8.6, proj: "projectiles/laser-bolt", look: critter("scifi/hologram", P_BRASS, 0.6) },
  // 9구역 별빛이 사라지는 심연
  v_starless_wraith: { name: "별빛 잃은 망령", ai: "blink", hp: 260, dmg: 70, speed: 112, range: 32, atkCd: 1.05, xp: 9.0, fly: true, look: critter("critters/ghost", P_VOID, 1.15) },
  v_void_ripper: { name: "공허 찢개", ai: "stalker", hp: 270, dmg: 70, speed: 160, range: 28, atkCd: 0.95, xp: 9.0, look: rig(STARLESS, "scythe", "hood", "#1c162c") },
  v_dark_choir: { name: "암흑 성가대", ai: "caster", hp: 260, dmg: 72, speed: 62, range: 260, atkCd: 2.3, xp: 9.2, aoe: "shadow/grasping-hands", look: rig(STARLESS, "staff", "mitre", "#342a4c") },
  v_null_star: { name: "꺼진 별", ai: "bomber", hp: 250, dmg: 88, speed: 92, range: 34, atkCd: 1.0, xp: 8.8, look: critter("critters/eyeball", P_VOID, 1.15) },
  v_abyss_priestess: { name: "심연 무녀", ai: "summoner", hp: 290, dmg: 70, speed: 58, range: 250, atkCd: 2.4, xp: 9.4, aoe: "shadow/void-orb", summon: "v_starless_wraith", look: rig(STARLESS, "staff", "hat", "#0c0816") },
  // 10구역 섬의 심장부
  v_heart_guard: { name: "심장부 근위병", ai: "chaser", hp: 310, dmg: 72, speed: 80, range: 46, atkCd: 1.15, xp: 9.6, look: rig(HEART, "greatsword", "helm", "#5a1a1c", 1.1) },
  v_vein_crawler: { name: "혈맥 포복자", ai: "swarm", hp: 220, dmg: 64, speed: 160, range: 26, atkCd: 0.85, xp: 8.6, look: critter("critters/snake", P_BLOOD, 1.25) },
  v_pulse_caster: { name: "맥동 술사", ai: "caster", hp: 270, dmg: 76, speed: 62, range: 260, atkCd: 2.2, xp: 9.6, aoe: "fire/flame-pillar", look: rig(HEART, "staff", "mitre", "#a03a34") },
  v_core_archer: { name: "핵 수호 궁수", ai: "ranged", hp: 260, dmg: 74, speed: 70, range: 285, atkCd: 1.35, xp: 9.4, proj: "fire/fireball", look: rig(HEART, "bow", "hood", "#3a0a12") },
  v_heart_colossus: { name: "심장 거신병", ai: "guard", hp: 540, dmg: 90, speed: 42, range: 60, atkCd: 2.6, xp: 10.4, look: rig(HEART, "hammer", "helm", "#e06a5a", 1.5) },
  // 제2 던전 1구역 왕릉의 침묵 회랑
  t_sarco_guard: { name: "석관 수호자", ai: "guard", hp: 520, dmg: 90, speed: 44, range: 58, atkCd: 2.6, xp: 11.0, look: rig(TOMB, "hammer", "helm", "#544a2c", 1.4) },
  t_tomb_mummy: { name: "봉인된 망자", ai: "chaser", hp: 320, dmg: 76, speed: 80, range: 44, atkCd: 1.15, xp: 10.0, look: rig(TOMB, "sword", "hood", "#8a7a50") },
  t_scarab: { name: "왕릉 풍뎅이", ai: "swarm", hp: 220, dmg: 66, speed: 164, range: 24, atkCd: 0.8, xp: 9.0, look: critter("critters/frog", P_TOMB, 0.9) },
  t_seal_keeper: { name: "봉인 장치기사", ai: "summoner", hp: 300, dmg: 74, speed: 58, range: 250, atkCd: 2.3, xp: 10.6, aoe: "arcane/rune-circle", summon: "t_scarab", look: rig(TOMB, "staff", "mitre", "#1e4a48") },
  t_canopic: { name: "카노푸스 단지령", ai: "bomber", hp: 260, dmg: 94, speed: 92, range: 34, atkCd: 1.0, xp: 9.8, look: critter("critters/ghost", P_TOMB, 1.1) },
  // 제2 던전 2구역 기억을 삼키는 궁정
  t_memory_echo: { name: "기억의 메아리", ai: "blink", hp: 300, dmg: 80, speed: 114, range: 32, atkCd: 1.0, xp: 10.6, fly: true, look: critter("critters/ghost", P_MEM, 1.15) },
  t_court_judge: { name: "망령 배심원", ai: "caster", hp: 300, dmg: 82, speed: 62, range: 260, atkCd: 2.2, xp: 10.8, aoe: "holy/smite", look: rig(COURT, "mace", "mitre", "#463e6a") },
  t_duelist: { name: "복제된 결투사", ai: "stalker", hp: 310, dmg: 80, speed: 162, range: 28, atkCd: 0.9, xp: 10.6, look: rig(COURT, "sword", "hood", "#2a1e48") },
  t_scribe_eye: { name: "기록하는 눈", ai: "ranged", hp: 280, dmg: 82, speed: 72, range: 285, atkCd: 1.3, xp: 10.4, proj: "shadow/void-orb", projSmall: true, fly: true, look: critter("critters/eyeball", P_MEM, 1.1) },
  t_court_bailiff: { name: "궁정 집행관", ai: "charger", hp: 340, dmg: 86, speed: 98, range: 46, atkCd: 1.8, xp: 11.0, look: rig(COURT, "greatsword", "helm", "#7a6ea8", 1.1) },
  // 제2 던전 3구역 역상의 왕좌
  t_inverse_knight: { name: "역상 기사", ai: "chaser", hp: 340, dmg: 84, speed: 82, range: 46, atkCd: 1.1, xp: 11.4, look: rig(THRONE, "greatsword", "helm", "#d8b860", 1.1) },
  t_gravity_orb: { name: "중력 구체", ai: "spore", hp: 360, dmg: 78, speed: 46, range: 235, atkCd: 2.5, xp: 11.2, aoe: "shadow/black-hole", fly: true, look: critter("shadow/void-orb", null, 1.1) },
  t_mirror_mage: { name: "반전 거울술사", ai: "summoner", hp: 320, dmg: 82, speed: 60, range: 255, atkCd: 2.2, xp: 11.6, aoe: "arcane/arcane-orb", summon: "t_memory_echo", look: rig(THRONE, "staff", "hat", "#f0e0b0") },
  t_crown_hound: { name: "왕관 사냥개", ai: "swarm", hp: 250, dmg: 72, speed: 166, range: 26, atkCd: 0.8, xp: 10.2, look: critter("fire/spirit-flame", P_MEM, 0.65) },
  t_throne_guard: { name: "옥좌 근위석상", ai: "guard", hp: 580, dmg: 96, speed: 42, range: 60, atkCd: 2.5, xp: 12.0, look: rig(THRONE, "hammer", "helm", "#8a7440", 1.5) },
};

// 보스 패턴 새 종류(server/game/ai.js): trackbomb(추적+지연 폭발) fakesafe(가짜 안전지대) seq(순차 결합) flood(수위·발판)
//  cracks(균열 지연 파열) roots(뿌리 속박→낙하) pylons(번개 기둥 전류) replay(잔상 재생) darkness(시야 제한) safemove(이동 안전 지대)
export const VERDAN_BOSSES = {
  // 1구역: 표적 추적 연속 공격 후 지연 폭발
  vb_rust_hunter: B({ name: "녹슨 추적자 카르그", hp: 30000, dmg: 80, speed: 84, look: rig(ERODE, "spear", "hood", "#382c38", 2.1), mid: true,
    patterns: [{ type: "trackbomb", n: 3, gap: 0.5, radius: 50, tel: 0.85, delay: 1.3, pow: 1.4, fx: "explosions/dirt-explosion" }, { type: "charge", dist: 320, width: 48, tel: 0.8, pow: 1.5 }, { type: "pools", n: 6, radius: 42, dur: 7, pow: 0.55, fx: "nature/toxic-puddle" }, { type: "summon", monster: "v_ash_hound", n: 3, phase2: true }] }),
  vb_erosion_lord: B({ name: "침식의 군주 바르골", hp: 82000, dmg: 96, speed: 78, look: rig(ERODE, "greatsword", "helm", "#5e4e5c", 2.6),
    patterns: [{ type: "trackbomb", n: 5, gap: 0.42, radius: 54, tel: 0.8, delay: 1.2, pow: 1.5, fx: "explosions/dirt-explosion" }, { type: "cleave", range: 130, arc: 160, tel: 0.75, pow: 1.8 }, { type: "walk", n: 10, gap: 0.08, step: 42, radius: 42, tel: 0.75, pow: 1.4, fx: "explosions/small-explosion" }, { type: "pools", n: 8, radius: 44, dur: 8, pow: 0.6, fx: "nature/toxic-puddle", phase2: true }, { type: "summon", monster: "v_blight_ooze", n: 4, phase2: true }] }),
  // 2구역: 눈보라와 가짜 안전지대
  vb_snow_widow: B({ name: "눈꽃 과부 일리아", hp: 34000, dmg: 84, speed: 80, look: rig(SNOWV, "staff", "hat", "#8a9ab8", 2.0), mid: true,
    patterns: [{ type: "fakesafe", safe: 60, decoys: 1, tel: 1.7, pow: 2.0, fx: "ice/frost-nova" }, { type: "rain", n: 9, radius: 46, tel: 0.95, pow: 1.4, fx: "ice/icicle-fall" }, { type: "barrage", count: 22, speed: 200, pow: 1.0, fx: "ice/ice-lance" }, { type: "summon", monster: "v_white_wisp", n: 3, phase2: true }] }),
  vb_oblivion_queen: B({ name: "망각의 설원 여왕 스카디르", hp: 90000, dmg: 100, speed: 76, look: rig(SNOWV, "scythe", "mitre", "#c8d4e8", 2.6),
    patterns: [{ type: "fakesafe", safe: 58, decoys: 2, tel: 1.6, pow: 2.1, fx: "ice/frost-nova", blizzard: true }, { type: "donut", inner: 100, outer: 250, tel: 0.95, pow: 1.7, fx: "ice/frost-nova" }, { type: "rain", n: 12, radius: 48, tel: 0.9, pow: 1.5, fx: "ice/icicle-fall" }, { type: "spiral", arms: 3, dur: 2.6, speed: 200, pow: 1.0, fx: "ice/ice-lance", phase2: true }, { type: "summon", monster: "v_snow_stalker", n: 3, phase2: true }] }),
  // 3구역: 회전 광선과 낙하 공격 순차
  vb_orrery_keeper: B({ name: "혼천의 관리자", hp: 38000, dmg: 86, speed: 72, look: critter("scifi/energy-core", P_STAR, 2.6), mid: true, fly: true,
    patterns: [{ type: "beam", dur: 3.8, width: 30, pow: 0.9, fx: "arcane/arcane-beam" }, { type: "rain", n: 10, radius: 48, tel: 1.0, pow: 1.45, fx: "arcane/star-fall" }, { type: "aimed", count: 7, spread: 60, speed: 280, pow: 1.0, fx: "projectiles/laser-bolt" }, { type: "summon", monster: "v_comet_mote", n: 4, phase2: true }] }),
  vb_sealed_astrologer: B({ name: "봉인된 점성술사 우라노스", hp: 98000, dmg: 104, speed: 74, look: rig(ASTRO, "staff", "mitre", "#ffe070", 2.6),
    patterns: [{ type: "seq", tel: 1.0, parts: [{ at: 0, p: { type: "beam", dur: 4.2, width: 32, pow: 0.95, fx: "arcane/arcane-beam" } }, { at: 1.6, p: { type: "rain", n: 9, radius: 48, tel: 1.1, pow: 1.45, fx: "arcane/star-fall", lane: true } }] },
      { type: "cross", len: 430, width: 40, tel: 0.85, pow: 1.5, fx: "arcane/star-fall" }, { type: "nova", step: 90, n: 3, tel: 0.85, pow: 1.4, fx: "arcane/mana-burst" }, { type: "summon", monster: "v_star_scribe", n: 2, phase2: true }, { type: "spiral", arms: 4, dur: 2.6, speed: 205, pow: 1.0, fx: "arcane/arcane-orb", phase2: true }] }),
  // 4구역: 수위 상승(발판 축소) + 끌어당김
  vb_tide_caller: B({ name: "조수 부름꾼 네레아", hp: 42000, dmg: 88, speed: 76, look: rig(DEEP, "staff", "hood", "#70ffd8", 2.1), mid: true,
    patterns: [{ type: "flood", plats: 4, stages: 2, r0: 96, shrink: 22, tel: 1.5, pow: 1.6, fx: "water/wave-crash" }, { type: "pull", radius: 260, tel: 0.85, pow: 1.5 }, { type: "barrage", count: 22, speed: 200, pow: 1.0, fx: "water/water-orb" }, { type: "summon", monster: "v_reef_jelly", n: 3, phase2: true }] }),
  vb_drowned_king: B({ name: "가라앉은 항구의 왕 레비아드", hp: 106000, dmg: 108, speed: 74, look: rig(DEEP, "scythe", "helm", "#70ffd8", 2.7),
    patterns: [{ type: "flood", plats: 4, stages: 3, r0: 100, shrink: 20, tel: 1.45, pow: 1.7, fx: "water/wave-crash", pull: true }, { type: "pull", radius: 280, tel: 0.8, pow: 1.6 }, { type: "lanes", n: 7, width: 42, len: 420, tel: 0.85, pow: 1.5, fx: "water/water-jet" }, { type: "donut", inner: 100, outer: 260, tel: 0.95, pow: 1.7, fx: "water/whirlpool", phase2: true }, { type: "summon", monster: "v_tide_harpooner", n: 3, phase2: true }] }),
  // 5구역: 유리 균열 지연 파열
  vb_mirage_twin: B({ name: "신기루 쌍둥이 셀레네", hp: 46000, dmg: 90, speed: 84, look: rig(GLASS, "dagger", "hood", "#3e8aa8", 2.0), mid: true,
    patterns: [{ type: "cracks", n: 4, len: 420, width: 40, tel: 0.9, delay: 1.25, pow: 1.5, fx: "ice/ice-shatter" }, { type: "multicharge", n: 3, dist: 320, width: 48, tel: 0.65, pow: 1.5 }, { type: "aimed", count: 9, spread: 70, speed: 290, pow: 1.0, fx: "ice/ice-lance" }, { type: "summon", monster: "v_mirage_dancer", n: 3, phase2: true }] }),
  vb_glass_sovereign: B({ name: "유리 사막의 군주 크리스탈리온", hp: 114000, dmg: 112, speed: 72, look: rig(GLASS, "greatsword", "helm", "#ffffff", 2.7),
    patterns: [{ type: "cracks", n: 6, len: 460, width: 42, tel: 0.85, delay: 1.2, pow: 1.6, fx: "ice/ice-shatter" }, { type: "grid", n: 6, tel: 0.95, pow: 1.5, fx: "ice/ice-shatter" }, { type: "cleave", range: 140, arc: 170, tel: 0.75, pow: 1.9 }, { type: "rain", n: 12, radius: 48, tel: 0.9, pow: 1.5, fx: "ice/icicle-fall", phase2: true }, { type: "summon", monster: "v_glass_scorpion", n: 3, phase2: true }] }),
  // 6구역: 뿌리 속박 후 낙하
  vb_root_witch: B({ name: "뿌리 마녀 이그드라", hp: 50000, dmg: 92, speed: 70, look: rig(GROVE, "staff", "mitre", "#e0ff70", 2.0), mid: true,
    patterns: [{ type: "roots", radius: 56, tel: 0.9, dur: 0.9, fall: { radius: 64, tel: 1.55, pow: 1.7 }, pow: 0.6, fx: "nature/root-snare" }, { type: "pools", n: 7, radius: 44, dur: 7, pow: 0.6, fx: "nature/poison-cloud" }, { type: "aimed", count: 7, spread: 60, speed: 260, pow: 1.0, fx: "nature/thorns" }, { type: "summon", monster: "v_thorn_beast", n: 4, phase2: true }] }),
  vb_slumber_titan: B({ name: "잠든 원시림의 거목왕 엘드윈", hp: 122000, dmg: 116, speed: 66, look: rig(GROVE, "hammer", "helm", "#3a2a14", 2.9),
    patterns: [{ type: "roots", radius: 60, tel: 0.85, dur: 1.0, fall: { radius: 70, tel: 1.6, pow: 1.8 }, pow: 0.7, fx: "nature/root-snare", extra: 4 }, { type: "slam", radius: 150, tel: 1.1, pow: 1.9, fx: "nature/quake" }, { type: "rain", n: 12, radius: 50, tel: 1.0, pow: 1.5, fx: "nature/boulder" }, { type: "walk", n: 10, gap: 0.08, step: 42, radius: 44, tel: 0.75, pow: 1.4, fx: "nature/earth-spike", phase2: true }, { type: "summon", monster: "v_elder_treant", n: 2, phase2: true }] }),
  // 7구역: 번개 기둥 사이 전류
  vb_storm_herald: B({ name: "폭풍 전령 볼타르", hp: 54000, dmg: 94, speed: 88, look: rig(TEMPEST, "spear", "helm", "#fff070", 2.1), mid: true,
    patterns: [{ type: "pylons", n: 3, tel: 1.1, pow: 1.6, width: 30, fx: "lightning/lightning-strike" }, { type: "charge", dist: 340, width: 48, tel: 0.7, pow: 1.6 }, { type: "rain", n: 10, radius: 46, tel: 0.9, pow: 1.45, fx: "lightning/lightning-strike" }, { type: "summon", monster: "v_volt_wisp", n: 3, phase2: true }] }),
  vb_spire_tyrant: B({ name: "폭풍 첨탑의 폭군 아스트라페", hp: 130000, dmg: 120, speed: 80, fly: true, look: critter("critters/bird", P_BOLT, 3.0),
    patterns: [{ type: "pylons", n: 5, tel: 1.05, pow: 1.7, width: 32, fx: "lightning/lightning-strike" }, { type: "lanes", n: 8, width: 40, len: 440, tel: 0.8, pow: 1.5, fx: "lightning/zap-hit" }, { type: "beam", dur: 4.2, width: 30, pow: 0.95, fx: "lightning/chain-lightning" }, { type: "ring", inner: 80, outer: 240, tel: 1.0, pow: 1.8, fx: "lightning/thunderclap", phase2: true }, { type: "summon", monster: "v_storm_lancer", n: 3, phase2: true }] }),
  // 8구역: 피했던 공격을 잔상으로 재생
  vb_clock_mender: B({ name: "태엽 수선공 호로", hp: 58000, dmg: 96, speed: 74, look: rig(COG, "hammer", "hat", "#60f0ff", 2.1), mid: true,
    patterns: [{ type: "replay", tel: 1.0 }, { type: "cross", len: 420, width: 40, tel: 0.85, pow: 1.5, fx: "scifi/emp-blast" }, { type: "chase", n: 5, gap: 0.38, radius: 50, tel: 0.75, pow: 1.2, fx: "impacts/ground-slam" }, { type: "summon", monster: "v_tick_bomb", n: 3, phase2: true }] }),
  vb_twisted_chronarch: B({ name: "뒤틀린 시간의 집정관 크로나스", hp: 138000, dmg: 124, speed: 76, look: critter("scifi/energy-core", P_BRASS, 3.2),
    patterns: [{ type: "replay", tel: 0.95, again: true }, { type: "grid", n: 6, tel: 0.95, pow: 1.5, fx: "scifi/laser-grid" }, { type: "nova", step: 95, n: 3, tel: 0.85, pow: 1.45, fx: "arcane/time-stop" }, { type: "multicharge", n: 3, dist: 330, width: 50, tel: 0.65, pow: 1.6 }, { type: "summon", monster: "v_gear_knight", n: 3, phase2: true }] }),
  // 9구역: 시야 제한 + 암흑 속 표적 공격
  vb_starless_shepherd: B({ name: "별빛을 거두는 목자", hp: 62000, dmg: 98, speed: 76, look: rig(STARLESS, "scythe", "hood", "#d070ff", 2.1), mid: true,
    patterns: [{ type: "darkness", dur: 5, vision: 170, n: 4, gap: 0.7, radius: 52, tel: 0.95, pow: 1.4, fx: "shadow/dark-explosion" }, { type: "barrage", count: 24, speed: 205, pow: 1.0, fx: "shadow/void-orb" }, { type: "pull", radius: 270, tel: 0.8, pow: 1.6 }, { type: "summon", monster: "v_starless_wraith", n: 3, phase2: true }] }),
  vb_night_devourer: B({ name: "밤을 삼키는 자 닉스헤임", hp: 146000, dmg: 128, speed: 78, look: rig(STARLESS, "scythe", "mitre", "#0c0816", 2.9),
    patterns: [{ type: "darkness", dur: 6, vision: 150, n: 6, gap: 0.6, radius: 54, tel: 0.95, pow: 1.5, fx: "shadow/dark-explosion" }, { type: "donut", inner: 105, outer: 265, tel: 0.95, pow: 1.8, fx: "shadow/eclipse" }, { type: "spiral", arms: 4, dur: 2.8, speed: 215, pow: 1.05, fx: "shadow/void-orb" }, { type: "chase", n: 6, gap: 0.36, radius: 52, tel: 0.72, pow: 1.25, fx: "shadow/grasping-hands", phase2: true }, { type: "summon", monster: "v_void_ripper", n: 3, phase2: true }] }),
  // 10구역: 섬의 심장부 — 이전 기믹 2~3개 결합 + 이동 안전 지대
  vb_heart_warden: B({ name: "심장핵 파수군주 아이온", hp: 68000, dmg: 102, speed: 80, look: rig(HEART, "greatsword", "helm", "#ffe08a", 2.3), mid: true,
    patterns: [{ type: "safemove", safe: 64, steps: 3, tel: 1.5, pow: 1.9, fx: "fire/fire-ring" }, { type: "trackbomb", n: 4, gap: 0.45, radius: 52, tel: 0.8, delay: 1.2, pow: 1.5, fx: "fire/meteor" }, { type: "cracks", n: 5, len: 440, width: 40, tel: 0.9, delay: 1.2, pow: 1.5, fx: "fire/flame-pillar" }, { type: "summon", monster: "v_heart_guard", n: 2, phase2: true }] }),
  vb_island_heart: B({ name: "베르단의 심장 오리진", hp: 180000, dmg: 136, speed: 76, look: critter("scifi/energy-core", P_BLOOD, 3.6), xp: 120, final: true,
    patterns: [
      { type: "safemove", safe: 66, steps: 4, tel: 1.45, pow: 2.0, fx: "fire/fire-ring" },
      { type: "seq", tel: 1.0, parts: [{ at: 0, p: { type: "trackbomb", n: 4, gap: 0.45, radius: 52, tel: 0.8, delay: 1.25, pow: 1.5, fx: "fire/meteor" } }, { at: 2.2, p: { type: "cracks", n: 4, len: 440, width: 40, tel: 0.9, delay: 1.2, pow: 1.5, fx: "fire/flame-pillar" } }] },
      { type: "seq", tel: 1.0, parts: [{ at: 0, p: { type: "pylons", n: 4, tel: 1.05, pow: 1.6, width: 30, fx: "lightning/lightning-strike" } }, { at: 1.8, p: { type: "roots", radius: 58, tel: 0.85, dur: 0.9, fall: { radius: 66, tel: 1.55, pow: 1.7 }, pow: 0.6, fx: "nature/root-snare" } }] },
      { type: "seq", tel: 1.0, phase2: true, parts: [{ at: 0, p: { type: "fakesafe", safe: 60, decoys: 2, tel: 1.6, pow: 2.0, fx: "fire/fire-ring" } }, { at: 2.4, p: { type: "replay", tel: 0.95 } }] },
      { type: "seq", tel: 1.0, phase2: true, parts: [{ at: 0, p: { type: "darkness", dur: 5, vision: 160, n: 4, gap: 0.7, radius: 54, tel: 0.95, pow: 1.5, fx: "shadow/dark-explosion" } }, { at: 0.6, p: { type: "flood", plats: 4, stages: 2, r0: 100, shrink: 22, tel: 1.5, pow: 1.7, fx: "fire/fire-ring" } }] },
      { type: "summon", monster: "v_heart_colossus", n: 2, phase2: true },
    ] }),
  // 제2 던전 「기억왕의 지하왕릉」
  tb_sarco_warden: B({ name: "석관 수문장 아멘호르", hp: 76000, dmg: 112, speed: 74, look: rig(TOMB, "hammer", "helm", "#5affe0", 2.3), mid: true,
    patterns: [{ type: "summon", monster: "t_tomb_mummy", n: 2 }, { type: "walk", n: 7, gap: 0.11, step: 42, radius: 42, tel: 0.9, pow: 1.15, fx: "nature/earth-spike" }, { type: "pools", n: 5, radius: 40, dur: 6, pow: 0.45, fx: "nature/toxic-puddle" }, { type: "trackbomb", n: 3, gap: 0.55, radius: 46, tel: 1.0, delay: 1.4, pow: 1.15, fx: "explosions/dirt-explosion", phase2: true }] }),
  tb_tomb_keeper: B({ name: "침묵의 왕릉지기 세트하르", hp: 196000, dmg: 140, speed: 72, look: rig(TOMB, "scythe", "mitre", "#5affe0", 2.9),
    patterns: [{ type: "summon", monster: "t_sarco_guard", n: 1 }, { type: "cross", len: 420, width: 38, tel: 1.0, pow: 1.2, fx: "nature/earth-spike" }, { type: "donut", inner: 105, outer: 245, tel: 1.1, pow: 1.3, fx: "explosions/dirt-explosion" }, { type: "trackbomb", n: 3, gap: 0.55, radius: 48, tel: 1.0, delay: 1.4, pow: 1.2, fx: "explosions/dirt-explosion" }, { type: "summon", monster: "t_canopic", n: 2, phase2: true }, { type: "grid", n: 4, tel: 1.15, pow: 1.15, fx: "arcane/rune-circle", phase2: true }] }),
  tb_memory_copier: B({ name: "기억 복제관 메네시아", hp: 84000, dmg: 116, speed: 78, look: rig(COURT, "staff", "hat", "#ff9ae0", 2.2), mid: true,
    patterns: [{ type: "replay", tel: 0.95 }, { type: "lanes", n: 5, width: 44, len: 410, tel: 1.05, pow: 1.2, fx: "holy/smite" }, { type: "chase", n: 3, gap: 0.5, radius: 46, tel: 0.95, pow: 1.0, fx: "holy/holy-pillar" }, { type: "summon", monster: "t_memory_echo", n: 2, phase2: true }] }),
  tb_oblivion_judge: B({ name: "망각의 재판관 레테", hp: 212000, dmg: 146, speed: 76, look: rig(COURT, "mace", "mitre", "#ff9ae0", 2.9),
    patterns: [{ type: "replay", tel: 1.15 }, { type: "cross", len: 430, width: 38, tel: 1.05, pow: 1.2, fx: "holy/smite" }, { type: "fakesafe", safe: 66, decoys: 1, tel: 1.85, pow: 1.25, fx: "holy/sunburst" }, { type: "nova", step: 95, n: 3, tel: 1.05, pow: 1.2, fx: "holy/holy-pillar" }, { type: "summon", monster: "t_court_bailiff", n: 2, phase2: true }, { type: "spiral", arms: 3, dur: 2.4, speed: 185, pow: 0.85, fx: "arcane/arcane-orb", phase2: true }] }),
  tb_inverse_captain: B({ name: "역상의 근위대장 오시르", hp: 92000, dmg: 120, speed: 80, look: rig(THRONE, "greatsword", "helm", "#ff3050", 2.3), mid: true,
    patterns: [{ type: "safemove", safe: 78, steps: 3, tel: 1.75, pow: 1.25, fx: "shadow/dark-explosion" }, { type: "multicharge", n: 3, dist: 300, width: 46, tel: 0.9, pow: 1.15 }, { type: "pull", radius: 240, tel: 1.0, pow: 1.15 }, { type: "summon", monster: "t_inverse_knight", n: 2, phase2: true }] }),
  tb_memory_king: B({ name: "기억왕의 잔영 므네모스", hp: 260000, dmg: 154, speed: 78, look: rig(THRONE, "scythe", "mitre", "#ff3050", 3.1), xp: 160, final: true,
    patterns: [
      { type: "safemove", safe: 82, steps: 3, tel: 1.8, pow: 1.25, fx: "shadow/dark-explosion" },
      { type: "seq", tel: 1.0, parts: [{ at: 0, p: { type: "cross", len: 430, width: 38, tel: 1.1, pow: 1.2, fx: "shadow/dark-explosion" } }, { at: 1.4, p: { type: "replay", tel: 1.15 } }] },
      { type: "grid", n: 4, tel: 1.15, pow: 1.2, fx: "arcane/rune-circle" },
      { type: "seq", tel: 1.0, parts: [{ at: 0, p: { type: "darkness", dur: 3.5, vision: 210, n: 3, gap: 0.9, radius: 48, tel: 1.15, pow: 1.1, fx: "shadow/dark-explosion" } }, { at: 1.2, p: { type: "nova", step: 95, n: 3, tel: 1.1, pow: 1.15, fx: "shadow/eclipse" } }] },
      { type: "seq", tel: 1.0, phase2: true, parts: [{ at: 0, p: { type: "fakesafe", safe: 68, decoys: 1, tel: 1.9, pow: 1.25, fx: "shadow/eclipse" } }, { at: 2.3, p: { type: "trackbomb", n: 3, gap: 0.55, radius: 46, tel: 1.05, delay: 1.45, pow: 1.15, fx: "shadow/dark-explosion" } }] },
      { type: "summon", monster: "t_throne_guard", n: 1, phase2: true },
      { type: "spiral", arms: 3, dur: 2.4, speed: 185, pow: 0.82, fx: "arcane/arcane-orb", phase2: true },
    ] }),
};

const Z = (name, floor, wall, accent, light, ambient, torch, monsters, mid, boss, weather, deco, extra = {}) => ({ name, floor, wall, accent, light, ambient, torch, monsters, mid, boss, weather, deco, ...extra });
export const VERDAN_ZONES = [
  Z("침식된 변경 지대", ["#3a3236", "#322a2e", "#2a2226", "#463c40"], ["#6a5a62", "#52444c", "#3a2e36", "#1e161c"], "#ff8a5a", 125, 0.9, "fire/brazier",
    ["v_rust_warden", "v_ash_hound", "v_rot_slinger", "v_blight_ooze", "v_scrap_brute"], "vb_rust_hunter", "vb_erosion_lord", "weather/fog", ["crack", "bones", "puddle"]),
  Z("망각의 설원", ["#4a5462", "#424c5a", "#3a4250", "#566072"], ["#9aaac0", "#7a8aa4", "#56627e", "#2e364a"], "#9ae0ff", 140, 0.86, "fire/spirit-flame",
    ["v_frost_reaver", "v_white_wisp", "v_rime_caster", "v_snow_stalker", "v_glacier_shell"], "vb_snow_widow", "vb_oblivion_queen", "weather/blizzard", ["ice", "crack", "bones"]),
  Z("봉인된 천문대", ["#262a44", "#20243c", "#1a1e34", "#2e3350"], ["#545ea0", "#3e4680", "#2a3060", "#141838"], "#ffe070", 130, 0.9, "arcane/rune-circle",
    ["v_orrery_guard", "v_star_scribe", "v_comet_mote", "v_lens_sniper", "v_seal_eye"], "vb_orrery_keeper", "vb_sealed_astrologer", "weather/shooting-stars", ["rune", "crack", "banner"]),
  Z("가라앉은 항구와 해저 유적", ["#163236", "#122a2e", "#0e2226", "#1c3c40"], ["#2e6e70", "#225456", "#163c3e", "#0a2022"], "#70ffd8", 120, 0.92, "water/bubbles",
    ["v_drowned_sailor", "v_reef_jelly", "v_tide_harpooner", "v_abyss_angler", "v_ruin_sentinel"], "vb_tide_caller", "vb_drowned_king", "weather/rain", ["puddle", "moss", "crack"]),
  Z("유리 사막", ["#5a5446", "#524c3e", "#4a4436", "#665e4e"], ["#a8d8e8", "#86b8cc", "#5e8ea8", "#36607a"], "#e8ffff", 165, 0.78, "fire/torch",
    ["v_glass_scorpion", "v_mirage_dancer", "v_prism_caster", "v_sand_shard", "v_glass_colossus"], "vb_mirage_twin", "vb_glass_sovereign", "weather/god-rays", ["crack", "ice", "bones"]),
  Z("잠든 원시림", ["#24321e", "#1e2c18", "#182414", "#2c3c24"], ["#3e5a2e", "#2e4622", "#203218", "#10180a"], "#e0ff70", 125, 0.9, "fire/spirit-flame",
    ["v_thorn_beast", "v_root_shaman", "v_spore_mother", "v_grove_ranger", "v_elder_treant"], "vb_root_witch", "vb_slumber_titan", "weather/fireflies", ["mushroom", "moss", "puddle"]),
  Z("폭풍의 첨탑", ["#2c2a44", "#26243c", "#201e34", "#343250"], ["#5e5a8a", "#4a4672", "#363258", "#1a1830"], "#fff070", 135, 0.88, "lightning/tesla-coil",
    ["v_storm_lancer", "v_volt_wisp", "v_thunder_priest", "v_gale_blade", "v_spire_golem"], "vb_storm_herald", "vb_spire_tyrant", "weather/storm", ["rune", "crack", "banner"]),
  Z("뒤틀린 시계 유적", ["#3a3428", "#322c22", "#2a241c", "#463e30"], ["#8a7048", "#6e5838", "#524028", "#2e2214"], "#60f0ff", 145, 0.84, "scifi/energy-core",
    ["v_gear_knight", "v_tick_bomb", "v_rewind_seer", "v_pendulum", "v_clock_turret"], "vb_clock_mender", "vb_twisted_chronarch", null, ["gear", "pipe", "crack"]),
  Z("별빛이 사라지는 심연", ["#181422", "#14101c", "#0e0b16", "#1e1a2a"], ["#3a2e52", "#2a2040", "#1a142c", "#0a0614"], "#d070ff", 100, 0.96, "shadow/shadow-flames",
    ["v_starless_wraith", "v_void_ripper", "v_dark_choir", "v_null_star", "v_abyss_priestess"], "vb_starless_shepherd", "vb_night_devourer", "weather/fog", ["rune", "bones", "crack"]),
  Z("섬의 심장부와 최종 보스 구역", ["#3a1a1e", "#321619", "#2a1214", "#462024"], ["#7a3036", "#62262a", "#481a1e", "#260c0e"], "#ffe08a", 140, 0.88, "fire/brazier",
    ["v_heart_guard", "v_vein_crawler", "v_pulse_caster", "v_core_archer", "v_heart_colossus"], "vb_heart_warden", "vb_island_heart", "weather/god-rays", ["banner", "candle", "crack"]),
];
export const TOMB_ZONES = [
  Z("왕릉의 침묵 회랑", ["#3e3828", "#363022", "#2e281c", "#4a4230"], ["#8a7a50", "#6e6040", "#524830", "#2c2618"], "#5affe0", 115, 0.92, "fire/spirit-flame",
    ["t_sarco_guard", "t_tomb_mummy", "t_scarab", "t_seal_keeper", "t_canopic"], "tb_sarco_warden", "tb_tomb_keeper", "weather/fog", ["bones", "crack", "rune"], { sarco: true }),
  Z("기억을 삼키는 궁정", ["#2a2436", "#241e30", "#1e1828", "#342c42"], ["#6a5e90", "#544a76", "#3e365a", "#1e1a30"], "#ff9ae0", 120, 0.92, "fire/candle",
    ["t_memory_echo", "t_court_judge", "t_duelist", "t_scribe_eye", "t_court_bailiff"], "tb_memory_copier", "tb_oblivion_judge", "weather/god-rays", ["banner", "candle", "rune"], { echoTele: true }),
  Z("역상의 왕좌", ["#1c1810", "#17130c", "#120f08", "#241e14"], ["#4a4028", "#3a321e", "#2a2414", "#14100a"], "#ff3050", 110, 0.94, "fire/brazier",
    ["t_inverse_knight", "t_gravity_orb", "t_mirror_mage", "t_crown_hound", "t_throne_guard"], "tb_inverse_captain", "tb_memory_king", "weather/shooting-stars", ["rune", "crack", "banner"], { glyphs: true }),
];
