// 스킬북: 기획서 2장의 모든 스킬. 서버가 steps를 실행하고, 클라이언트는 설명·쿨타임·이펙트 표시에 사용.
//
// kind: basic(기본 공격, aspd=공격 간격) | active | passive | ultimate
// aim : dir(마우스 방향) | point(지면 지점, range 이내) | self | ally(마우스에 가장 가까운 아군, 없으면 자신)
// pow : 공격력(atk) 대비 계수. 치유·보호막은 치유력 대비 계수.
// steps의 do 종류는 server/game/skills.js 에 구현.

const S = [];
const add = (cls, list) => list.forEach((s) => S.push({ cls, ...s }));

// ─────────────────────────── 모험가 공용 스킬 ───────────────────────────
add("common", [
  { id: "c_thrust", name: "찌르기", grade: "일반", kind: "basic", aspd: 0.65, aim: "dir", anim: "thrust",
    desc: "빠르게 한 지점을 공격하는 기본 단일 공격.", limit: "자원 없이 계속 쓸 수 있는 기본 공격. 직업 주력기보다 피해량은 낮다.",
    fx: { hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 46, arc: 40, pow: 0.65, max: 1 }] },
  // 모험가가 활·지팡이를 들면 기본 공격이 자동으로 바뀜 (근접으로 활을 휘두르던 문제)
  { id: "c_shot", name: "활쏘기", grade: "일반", kind: "basic", aspd: 0.8, aim: "dir", anim: "shoot", weaponBasic: "bow",
    desc: "활을 들었을 때의 기본 공격. 화살 한 발을 쏜다.", limit: "근접 찌르기보다 한 발 피해는 낮다.",
    fx: { proj: "projectiles/arrow", hit: "impacts/hit-spark" }, steps: [{ do: "proj", speed: 500, range: 260, pow: 0.55, radius: 5 }] },
  { id: "c_bolt", name: "마력탄", grade: "일반", kind: "basic", aspd: 0.85, aim: "dir", anim: "cast", weaponBasic: "staff",
    desc: "지팡이를 들었을 때의 기본 공격. 작은 마력 구슬을 쏜다.", limit: "근접 찌르기보다 한 발 피해는 낮다.",
    fx: { proj: "arcane/arcane-orb", scale: 0.45, hit: "arcane/mana-burst" }, steps: [{ do: "proj", speed: 400, range: 240, pow: 0.55, radius: 6 }] },
  // 근접 무기별 기본 공격 (장검·맨손은 찌르기)
  { id: "c_bash", name: "몽둥이 휘두르기", grade: "일반", kind: "basic", aspd: 0.8, aim: "dir", anim: "smash", weaponBasic: "club",
    desc: "몽둥이를 들었을 때의 기본 공격. 앞쪽을 넓게 휘둘러 최대 2명을 때리고 살짝 밀어낸다.", limit: "찌르기보다 느리고 한 대 피해는 조금 낮다.",
    fx: { swing: "melee/spear-sweep", hit: "impacts/blunt-hit" }, steps: [{ do: "melee", range: 44, arc: 90, pow: 0.62, max: 2, knock: 8 }] },
  { id: "c_smite", name: "메이스 강타", grade: "일반", kind: "basic", aspd: 0.85, aim: "dir", anim: "smash", weaponBasic: "mace",
    desc: "메이스를 들었을 때의 기본 공격. 한 대상을 묵직하게 내려친다.", limit: "느린 대신 한 방이 세다. 한 명만 맞힌다.",
    fx: { hit: "impacts/blunt-hit", hitScale: 0.8 }, steps: [{ do: "melee", range: 42, arc: 50, pow: 0.82, max: 1 }] },
  { id: "c_jab", name: "너클 연타", grade: "일반", kind: "basic", aspd: 0.55, aim: "dir", anim: "punch", weaponBasic: "knuckle",
    desc: "너클을 들었을 때의 기본 공격. 빠르게 두 번 주먹을 꽂는다.", limit: "사거리가 가장 짧다.",
    fx: { hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 36, arc: 50, pow: 0.33, max: 1, hits: 2, gap: 0.12 }] },
  { id: "c_stab", name: "단검 찌르기", grade: "일반", kind: "basic", aspd: 0.5, aim: "dir", anim: "stab", weaponBasic: "dagger",
    desc: "단검을 들었을 때의 기본 공격. 아주 빠르게 찌르고 치명타 확률이 10%p 높다.", limit: "사거리가 짧고 한 대 피해가 낮다.",
    fx: { swing: "melee/thrust", hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 38, arc: 40, pow: 0.5, max: 1, critBonus: 0.1 }] },
  { id: "c_pound", name: "망치 내려찍기", grade: "일반", kind: "basic", aspd: 0.95, aim: "dir", anim: "smash", weaponBasic: "hammer",
    desc: "망치를 들었을 때의 기본 공격. 앞쪽 바닥을 내려찍어 최대 3명을 맞힌다.", limit: "가장 느린 기본 공격.",
    fx: { hit: "impacts/ground-slam", hitScale: 0.5 }, steps: [{ do: "melee", range: 50, arc: 110, pow: 0.85, max: 3 }] },
  { id: "c_slash", name: "베기", grade: "일반", kind: "active", cd: 2, cost: { mp: 2 }, aim: "dir", anim: "slash",
    desc: "전방을 가로질러 공격하는 기본 근접 기술.", limit: "찌르기보다 범위가 넓은 대신 단일 대상 피해가 낮다.",
    fx: { swing: "melee/sword-slash", hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 46, arc: 120, pow: 0.6 }] },
  { id: "c_dash", name: "대시", grade: "일반", kind: "active", cd: 3, aim: "dir", anim: "dash", moveSkill: true, noGcd: true,
    desc: "짧은 거리를 빠르게 이동하는 기본 기동기.", limit: "기본 무적은 없다. 직업 고유 이동기와 중첩 연속 사용을 제한한다.",
    fx: { self: "spawn/poof" }, steps: [{ do: "dash", dist: 96, speed: 520 }] },
  { id: "c_firstaid", name: "응급처치", grade: "일반", kind: "active", cd: 30, aim: "self", anim: "cast", cast: 0.4,
    desc: "자신을 소량 회복하는 기본 생존기.", limit: "쿨타임 30초와 회복량 상한(최대 HP 18%)을 두어 치유·탱커 생존기를 대체하지 않는다.",
    fx: { self: "holy/heal", palette: ["#0a2a10", "#1d6b2a", "#3fae4a", "#8fe88a", "#d8ffd0", "#ffffff"] },
    steps: [{ do: "heal", target: "self", pctMax: 0.18 }] },
]);

// ─────────────────────────── 1. 검사 ───────────────────────────
add("sword", [
  // 검술 자세
  { id: "sw_gale", name: "질풍", grade: "일반", kind: "basic", aspd: 0.8, stance: "검술", aim: "dir", anim: "slash",
    desc: "기본 평타이자 내력 회복기.", limit: "내력 수급량에 초당 상한을 두어 무한 연계를 방지.",
    fx: { swing: "melee/sword-slash", hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 48, arc: 100, pow: 0.95, gainOnHit: { ki: 8 } }] },
  { id: "sw_thrust", name: "찌르기(검술)", grade: "일반", kind: "active", cd: 3, stance: "검술", cost: { ki: 15 }, aim: "dir", anim: "thrust",
    desc: "검사 전용 주요 단일 딜링기. 공용 찌르기와 별개의 검술 연계 기술.", limit: "반복 사용만으로 최대 화력이 되지 않도록 연계·자원 비용을 둔다.",
    fx: { swing: "melee/thrust", hit: "impacts/crit-hit" }, steps: [{ do: "melee", range: 64, arc: 30, pow: 2.0, max: 1, comboBonus: 0.25 }] },
  { id: "sw_block", name: "막기", grade: "일반", kind: "active", cd: 6, stance: "검술", aim: "dir", anim: "guard",
    desc: "정면 공격을 방어하고 성공 시 튕겨내 반격 기회를 만든다.", limit: "타이밍·방향 조건이 있으며 실패 시 피해를 받는다. 장시간 방어 유지 불가(0.6초).",
    fx: { self: "impacts/parry" }, steps: [{ do: "parry", dur: 0.6, arc: 120, counter: { pow: 1.2, gain: { ki: 20 }, buff: { id: "riposte", dur: 3, mods: { dmg: 0.2 } } } }] },
  { id: "sw_charge", name: "돌진", grade: "희귀", kind: "active", cd: 9, stance: "검술", cost: { ki: 10 }, aim: "dir", anim: "dash", moveSkill: true,
    desc: "적에게 접근해 기절을 유발한다.", limit: "일반 적 중심. 보스는 제어 면역, 짧은 그로기 누적만 받는다.",
    fx: { self: "melee/thrust", hit: "status/stunned" }, steps: [{ do: "dash", dist: 130, speed: 600, stopOnHit: true, hit: { pow: 1.3, cc: { type: "stun", dur: 1.0 }, groggy: 18 } }] },
  { id: "sw_raid", name: "습격", grade: "희귀", kind: "active", cd: 10, stance: "검술", cost: { ki: 10 }, aim: "dir", anim: "dash", moveSkill: true,
    desc: "적에게 뛰어들어 넘어뜨린다(다운).", limit: "일반 적 중심. 보스는 다운 면역, 그로기만 누적.",
    fx: { self: "spawn/poof", hit: "impacts/heavy-landing" }, steps: [{ do: "dash", dist: 120, speed: 560 }, { do: "circle", radius: 44, pow: 1.2, cc: { type: "down", dur: 1.0 }, groggy: 16 }] },
  { id: "sw_lowcut", name: "하단베기", grade: "희귀", kind: "active", cd: 8, stance: "검술", cost: { ki: 12 }, aim: "dir", anim: "slash",
    desc: "적을 넘어뜨려 연계 기회를 만든다.", limit: "대상별 재사용 제한과 보스 면역 적용.",
    fx: { swing: "melee/spear-sweep", hit: "impacts/blunt-hit" }, steps: [{ do: "melee", range: 52, arc: 140, pow: 1.4, cc: { type: "down", dur: 1.2 }, groggy: 14 }] },
  { id: "sw_kick", name: "발차기", grade: "희귀", kind: "active", cd: 8, stance: "검술", cost: { ki: 8 }, aim: "dir", anim: "kick",
    desc: "발차기로 적을 넘어뜨리고 밀쳐 낸다.", limit: "대상별 재사용 제한과 보스 면역 적용.",
    fx: { hit: "impacts/blunt-hit" }, steps: [{ do: "melee", range: 40, arc: 70, pow: 1.1, max: 1, knock: 60, cc: { type: "down", dur: 1.0 }, groggy: 12 }] },
  { id: "sw_shoulder", name: "어깨치기", grade: "희귀", kind: "active", cd: 9, stance: "검술", cost: { ki: 10 }, aim: "dir", anim: "dash",
    desc: "적의 그로기를 쌓고 자세 전환 기회를 만든다.", limit: "그로기 게이지 누적 상한을 둔다.",
    fx: { hit: "impacts/blunt-hit" }, steps: [{ do: "dash", dist: 48, speed: 420 }, { do: "melee", range: 40, arc: 90, pow: 1.3, groggy: 30, knock: 30, grantStanceShift: true }] },
  { id: "sw_fiveslash", name: "오연베기", grade: "영웅", kind: "active", cd: 14, stance: "검술", cost: { ki: 30 }, aim: "dir", anim: "combo",
    desc: "다섯 번 연속 베며 그로기를 유발하는 주력 연계기.", limit: "후딜을 두고 타격당 피해를 낮춘다. 보스는 그로기 게이지만 누적.",
    fx: { swing: "melee/double-slash", hit: "impacts/hit-spark" }, recover: 0.35,
    steps: [{ do: "melee", range: 54, arc: 110, pow: 0.75, hits: 5, gap: 0.11, groggy: 8, cc: { type: "stun", dur: 0.4 } }] },
  { id: "sw_moon", name: "만월베기", grade: "영웅", kind: "active", cd: 9, stance: "검술", cost: { ki: 20 }, aim: "self", anim: "spin",
    desc: "넓은 호를 그리는 광역 공격이며 자세 전환을 돕는다.", limit: "대상 수(최대 6)와 연속 적중 피해를 제한한다.",
    fx: { swing: "melee/spin-slash", hit: "impacts/hit-spark" }, steps: [{ do: "circle", radius: 64, pow: 1.6, max: 6, grantStanceShift: true }] },
  // 발도술 자세
  { id: "sw_draw", name: "발도", grade: "일반", kind: "basic", aspd: 0.9, stance: "발도술", aim: "dir", anim: "slash",
    desc: "빠른 연속 공격. 치명타 시 추가 효과(추가 베기) 발동.", limit: "추가 효과에 내부 쿨타임(2초)을 두어 연쇄 발동을 방지한다.",
    fx: { swing: "melee/double-slash", hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 50, arc: 80, pow: 0.55, hits: 2, gap: 0.12, gainOnHit: { ki: 4 }, onCrit: { pow: 0.6, icd: 2 } }] },
  { id: "sw_vital", name: "급소베기", grade: "희귀", kind: "active", cd: 6, stance: "발도술", cost: { ki: 15 }, aim: "dir", anim: "slash",
    desc: "발도 자세의 핵심 단일 공격.", limit: "약점·연계 조건(기절·다운·그로기 대상 +50%)을 요구하며 반복 사용 효율 제한.",
    fx: { swing: "melee/sword-slash", hit: "impacts/crit-hit" }, steps: [{ do: "melee", range: 54, arc: 50, pow: 2.1, max: 1, vsCC: 0.5 }] },
  { id: "sw_firedragon", name: "화룡연참", grade: "영웅", kind: "active", cd: 15, stance: "발도술", cost: { ki: 30 }, aim: "dir", anim: "combo",
    desc: "화염 속성 연속 베기와 화상 피해.", limit: "화상은 제한된 지속시간(4초)·중첩(1)만 허용.",
    fx: { swing: "fire/fire-breath", hit: "impacts/hit-spark" },
    steps: [{ do: "melee", range: 58, arc: 120, pow: 0.9, hits: 3, gap: 0.14, status: { type: "burn", dur: 4, pow: 0.25 } }] },
  { id: "sw_thunder", name: "뇌령", grade: "영웅", kind: "active", cd: 12, stance: "발도술", cost: { ki: 25 }, aim: "dir", anim: "thrust",
    desc: "번개 속성 주력 공격. 주변 적에게 번개가 연쇄된다.", limit: "연쇄 대상 수(3)·감전 지속시간(3초) 상한.",
    fx: { swing: "melee/thrust", hit: "lightning/zap-hit", chain: "lightning/chain-lightning" },
    steps: [{ do: "melee", range: 60, arc: 40, pow: 2.2, max: 1, chain: { n: 3, range: 90, pow: 0.9 }, status: { type: "shock", dur: 3 } }] },
  {
  id: "sw_flash", name: "일섬", grade: "전설", kind: "ultimate", cd: 24, stance: "발도술", cost: { ki: 45 }, aim: "dir", anim: "dash", moveSkill: true,
  desc: "전장을 가로지르는 초고속 발도. 지나간 적을 베고 착지 지점에 검풍을 폭발시킨 뒤 공격력이 상승한다.",
  limit: "돌진 경로와 착지 주변을 모두 공격하며, 보스에게도 그로기를 누적한다.",
  fx: { self: "arcane/blink-out", hit: "impacts/crit-hit", line: "impacts/impact-frame" },
  steps: [
    { do: "dash", dist: 200, speed: 1500, through: true, hit: { pow: 6.2, critBonus: 0.2, groggy: 22 } },
    { do: "circle", radius: 78, pow: 2.6, max: 8, groggy: 14 },
    { do: "buff", target: "self", id: "flash_edge", dur: 5, mods: { dmg: 0.18 } },
  ],
},
  // 어검 자세
  { id: "sw_eo_burst", name: "어검발산", grade: "영웅", kind: "active", cd: 18, stance: "어검", cost: { ki: 20 }, aim: "self", anim: "cast",
    desc: "주변 적을 공격하고 내력을 회복하며 짧은 공격 버프를 얻는다.", limit: "대상 수(5)와 자원 회복량 제한. 방어 버프는 소폭.",
    fx: { self: "arcane/mana-burst", palette: ["#0a1430", "#1f3a80", "#3f74d0", "#8fc0ff", "#d8ecff", "#ffffff"] },
    steps: [{ do: "circle", radius: 72, pow: 1.3, max: 5, gainPerHit: { ki: 8 }, gainCap: { ki: 40 } }, { do: "buff", target: "self", id: "eo_burst", dur: 6, mods: { dmg: 0.12, dr: 0.05 } }] },
  { id: "sw_eo_guard", name: "어검보호(검막)", grade: "영웅", kind: "active", cd: 30, stance: "어검", cost: { ki: 20 }, aim: "self", anim: "guard",
    desc: "자신에게 짧은 어검 보호막을 형성해 위험 공격을 완화한다.", limit: "파티 전체 무적이 아닌 개인 보호막이며, 흡수량 상한과 중첩 불가를 적용한다.",
    fx: { self: "scifi/force-field", palette: ["#0a1430", "#1f3a80", "#3f74d0", "#8fc0ff", "#d8ecff", "#ffffff"] },
    steps: [{ do: "shield", target: "self", pctMax: 0.25, dur: 4 }] },
  { id: "sw_eo_rain", name: "어검연속베기", grade: "영웅", kind: "active", cd: 18, stance: "어검", cost: { ki: 25 }, aim: "point", range: 220, anim: "cast",
    desc: "원거리 광역 지속 피해를 준다.", limit: "지속시간(3초)과 대상별 적중 횟수를 제한하고 틱당 피해를 낮춘다.",
    fx: { area: "melee/dagger-flurry", palette: ["#0a1430", "#1f3a80", "#3f74d0", "#8fc0ff", "#d8ecff", "#ffffff"] },
    steps: [{ do: "area", radius: 60, pow: 0.45, ticks: 6, interval: 0.5, telegraph: 0.3 }] },
  {
  id: "sw_eo_vortex", name: "회천령", grade: "전설", kind: "ultimate", cd: 30, stance: "어검", cost: { ki: 45 }, aim: "self", anim: "cast",
  desc: "어검의 폭풍이 자신을 따라다니며 주변 적을 연속으로 베고, 시전자의 공격력을 끌어올린다.",
  limit: "넓은 추적 범위와 최대 대상 수를 유지해 다수전에 강하다.",
  fx: { area: "fire/fire-tornado", palette: ["#0a1430", "#1f3a80", "#3f74d0", "#8fc0ff", "#d8ecff", "#ffffff"] },
  steps: [
    { do: "zone", at: "self", follow: true, radius: 108, dur: 4, interval: 0.4, pow: 0.95, max: 12 },
    { do: "buff", target: "self", id: "eo_tempest", dur: 6, mods: { dmg: 0.15 } },
  ],
},
  {
  id: "sw_eo_bolt", name: "번개베기", grade: "전설", kind: "ultimate", cd: 30, stance: "어검", cost: { ki: 45 }, aim: "point", range: 260, anim: "cast",
  desc: "지정 지점에 세 차례 강력한 낙뢰를 내리꽂아 적 무리를 감전시킨다.",
  limit: "낙뢰 범위와 대상 수가 증가하고 감전 지속시간도 길어졌다.",
  fx: { area: "lightning/lightning-strike" },
  steps: [{ do: "area", radius: 98, pow: 1.95, ticks: 3, interval: 0.32, telegraph: 0.42, max: 10, status: { type: "shock", dur: 3 } }],
},
]);

// ─────────────────────────── 2. 권투사 ───────────────────────────
add("fist", [
  { id: "fi_jab", name: "정권", grade: "일반", kind: "basic", aspd: 0.9, aim: "dir", anim: "punch",
    desc: "기본 평타이자 내력 수급기. 위협을 안정적으로 생성한다.", limit: "자원 회복량과 위협 수치 상한.",
    fx: { hit: "impacts/blunt-hit" }, steps: [{ do: "melee", range: 40, arc: 70, pow: 0.75, max: 2, threat: 2.0, gainOnHit: { ki: 7 } }] },
  { id: "fi_counter", name: "반격", grade: "일반", kind: "active", cd: 6, cost: { ki: 5 }, aim: "dir", anim: "guard",
    desc: "정면 공격을 막고 반격하며 높은 위협을 쌓는 탱킹 핵심기.", limit: "타이밍·방향 조건. 연속 방어 시 자원 소모 증가, 반격 내부 쿨타임 적용.",
    fx: { self: "impacts/shield-block", hit: "impacts/blunt-hit" },
    steps: [{ do: "parry", dur: 0.8, arc: 140, counter: { pow: 1.3, threat: 6, gain: { ki: 15 } } }] },
  // (예전 반격기 '이문정주' 자리 → 공격기로 교체. 이미 장착한 사람은 그대로 철산고가 됨)
  { id: "fi_imun", name: "철산고", grade: "일반", kind: "active", cd: 6, cost: { ki: 10 }, aim: "dir", anim: "dash", moveSkill: true,
    desc: "어깨로 몸통 박치기를 하며 돌진해, 부딪힌 적에게 큰 피해를 주고 멀리 밀쳐 낸다.", limit: "처음 부딪힌 적에서 멈춘다.",
    fx: { self: "spawn/poof", hit: "explosions/cartoon-pow" }, steps: [{ do: "dash", dist: 100, speed: 600, stopOnHit: true, hit: { pow: 1.6, knock: 70, groggy: 12, threat: 3 } }] },
  { id: "fi_combo", name: "연환권", grade: "일반", kind: "active", cd: 3, cost: { ki: 8 }, aim: "dir", anim: "punch",
    desc: "눈에 보이지 않을 만큼 빠르게 주먹을 세 번 꽂는다.", limit: "한 명만 노린다.",
    fx: { swing: "melee/dagger-flurry", hit: "impacts/blunt-hit" }, steps: [{ do: "melee", range: 44, arc: 60, pow: 0.6, hits: 3, gap: 0.09, max: 1, threat: 1.5 }] },
  { id: "fi_palm", name: "장풍", grade: "희귀", kind: "active", cd: 6, cost: { ki: 15 }, aim: "dir", anim: "punch",
    desc: "내력을 손바닥에 모아 앞으로 쏘아 보낸다. 줄지어 선 적 4명까지 꿰뚫는다.", limit: "권투사의 유일한 원거리기. 사거리 중간.",
    fx: { proj: "projectiles/energy-disc", palette: ["#200800", "#802008", "#e05020", "#ffa040", "#ffe8a0", "#ffffff"], hit: "explosions/cartoon-pow" },
    steps: [{ do: "proj", speed: 560, range: 280, pow: 2.0, radius: 12, pierce: 3, knock: 30, threat: 2 }] },
  { id: "fi_twinclaw", name: "호조쌍격", grade: "희귀", kind: "active", cd: 7, cost: { ki: 15 }, aim: "dir", anim: "punch",
    desc: "호랑이 발톱처럼 두 손을 연달아 휘둘러 앞쪽 적 4명까지 찢는다.", limit: "두 번째 타격은 첫 타격 뒤 0.15초.",
    fx: { swing: "melee/claw-swipe", hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 56, arc: 120, pow: 1.4, hits: 2, gap: 0.15, max: 4, threat: 2, knock: 20 }] },
  { id: "fi_meteorkick", name: "유성각", grade: "영웅", kind: "active", cd: 12, cost: { ki: 25 }, aim: "dir", anim: "dash", moveSkill: true,
    desc: "높이 뛰어올라 유성처럼 내리꽂는 발차기. 떨어진 자리 주변 적을 기절시킨다.", limit: "보스는 기절 면역(그로기만 누적).",
    fx: { self: "spawn/poof", area: "impacts/ground-slam" }, steps: [{ do: "dash", dist: 150, speed: 680 }, { do: "circle", radius: 74, pow: 2.6, max: 6, threat: 4, cc: { type: "stun", dur: 0.7 }, groggy: 22 }] },
  { id: "fi_thousand", name: "천수권", grade: "영웅", kind: "active", cd: 14, cost: { ki: 30 }, aim: "dir", anim: "punch",
    desc: "천 개의 손처럼 보이는 주먹 세례. 앞쪽 적 2명에게 10연타를 퍼붓는다.", limit: "타격마다 피해는 낮지만 합치면 매우 높다.",
    fx: { swing: "melee/dagger-flurry", hit: "impacts/blunt-hit", palette: ["#200800", "#802008", "#e05020", "#ffa040", "#ffe8a0", "#ffffff"] },
    steps: [{ do: "melee", range: 52, arc: 70, pow: 0.5, hits: 10, gap: 0.07, max: 2, threat: 1 }] },
  { id: "fi_sidestep", name: "횡이동", grade: "일반", kind: "active", cd: 8, aim: "dir", anim: "dash", moveSkill: true,
    desc: "공격을 저항하며 측면으로 이동해 위험 범위를 벗어난다.", limit: "이동 거리 제한. 탱커 생존 보조이지 무적기 아님.",
    fx: { self: "spawn/poof" }, steps: [{ do: "dash", dist: 80, speed: 480, side: true }, { do: "buff", target: "self", id: "sidestep", dur: 1.0, mods: { dr: 0.25 } }] },
  { id: "fi_dive", name: "파고들기", grade: "일반", kind: "active", cd: 8, aim: "dir", anim: "dash", moveSkill: true,
    desc: "앞으로 파고들어 표적을 다시 잡는다.", limit: "이동 거리 제한. 무적 없음.",
    fx: { self: "spawn/poof", hit: "impacts/blunt-hit" }, steps: [{ do: "dash", dist: 100, speed: 520, stopOnHit: true, hit: { pow: 0.6, threat: 5 } }] },
  { id: "fi_burst", name: "폭권", grade: "희귀", kind: "active", cd: 4, cost: { ki: 15 }, aim: "dir", anim: "punch",
    desc: "단일 대상에 묵직한 피해와 위협을 주는 기본 주력기.", limit: "탱커 피해량이 딜러를 넘지 않도록 계수 제한.",
    fx: { hit: "explosions/cartoon-pow" }, steps: [{ do: "melee", range: 44, arc: 50, pow: 1.5, max: 1, threat: 3, knock: 20 }] },
  { id: "fi_tiger", name: "맹호장", grade: "희귀", kind: "active", cd: 6, cost: { ki: 15 }, aim: "dir", anim: "punch",
    desc: "단일 또는 소범위 타격으로 적을 압박한다.", limit: "자원 소비와 대상 수(3) 상한.",
    fx: { hit: "impacts/ground-slam" }, steps: [{ do: "melee", range: 52, arc: 90, pow: 1.4, max: 3, threat: 2.5, status: { type: "weaken", dur: 4, v: 0.1 } }] },
  { id: "fi_reddragon", name: "적룡권", grade: "영웅", kind: "active", cd: 12, cost: { ki: 30 }, aim: "dir", anim: "punch",
    desc: "광역 공격과 위협 생성에 특화한 주력기.", limit: "대상 수(6)와 위협량 제한, 범위 피해는 딜러보다 낮게.",
    fx: { swing: "fire/fire-breath", hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 72, arc: 100, pow: 1.5, max: 6, threat: 4, status: { type: "burn", dur: 3, pow: 0.15 } }] },
  { id: "fi_spinkick", name: "회천각", grade: "희귀", kind: "active", cd: 9, cost: { ki: 10 }, aim: "self", anim: "spin",
    desc: "치명타·조건부로 콤보를 잇는 회전 발차기. 방어 성공 직후 강화.", limit: "발동 내부 쿨타임으로 연계 빈도 제한, 방어 성공 보상 우선.",
    fx: { swing: "melee/spin-slash", hit: "impacts/blunt-hit" }, steps: [{ do: "circle", radius: 52, pow: 1.1, max: 5, threat: 2, afterParry: 0.5 }] },
  { id: "fi_whiteheat", name: "백열각", grade: "희귀", kind: "active", cd: 9, cost: { ki: 10 }, aim: "dir", anim: "kick",
    desc: "치명타 확률이 높은 날카로운 발차기. 치명타 시 내력 추가 획득.", limit: "발동 확률과 내부 쿨타임 제한.",
    fx: { hit: "impacts/crit-hit" }, steps: [{ do: "melee", range: 46, arc: 60, pow: 1.4, max: 1, threat: 2, critBonus: 0.2, onCrit: { gain: { ki: 15 }, icd: 4 } }] },
  { id: "fi_rising", name: "승룡각", grade: "희귀", kind: "active", cd: 10, cost: { ki: 15 }, aim: "dir", anim: "kick",
    desc: "짧은 기절을 주며 적의 공격을 끊거나 위협을 확보한다.", limit: "일반 적 제어 중심, 보스의 주요 패턴은 끊지 못함.",
    fx: { swing: "melee/uppercut", hit: "status/stunned" }, steps: [{ do: "melee", range: 44, arc: 60, pow: 1.2, max: 2, threat: 4, cc: { type: "stun", dur: 1.2 }, groggy: 20, interrupt: true }] },
  { id: "fi_trip", name: "다리걸기", grade: "희귀", kind: "active", cd: 8, cost: { ki: 10 }, aim: "dir", anim: "kick",
    desc: "적을 넘어뜨려 시전·이동을 방해한다.", limit: "보스 다운 면역, 대상별 재사용 제한.",
    fx: { hit: "impacts/heavy-landing" }, steps: [{ do: "melee", range: 42, arc: 90, pow: 0.9, max: 2, threat: 3, cc: { type: "down", dur: 1.4 }, groggy: 14, interrupt: true }] },
  { id: "fi_landslide", name: "산사태", grade: "영웅", kind: "active", cd: 18, cost: { ki: 30 }, aim: "self", anim: "smash",
    desc: "주변 적에게 그로기와 위협을 쌓는 광역 제어기.", limit: "일반 적 제어시간을 짧게 하고, 보스는 그로기 게이지 일부만 누적.",
    fx: { area: "nature/quake" }, steps: [{ do: "circle", radius: 88, pow: 1.2, max: 8, threat: 5, cc: { type: "stun", dur: 0.8 }, groggy: 25 }] },
  { id: "fi_dance", name: "권무", grade: "영웅", kind: "active", cd: 14, cost: { ki: 25 }, aim: "dir", anim: "dash", moveSkill: true,
    desc: "적에게 돌진하며 연속 타격과 짧은 피해 저항을 얻는다.", limit: "저항 시간·대상 수 제한, 이동 중 무적 없음.",
    fx: { swing: "melee/dagger-flurry", hit: "impacts/blunt-hit" },
    steps: [{ do: "buff", target: "self", id: "dance", dur: 2, mods: { dr: 0.2 } }, { do: "dash", dist: 90, speed: 500, stopOnHit: true }, { do: "melee", range: 48, arc: 100, pow: 0.55, hits: 4, gap: 0.12, max: 3, threat: 1.5 }] },
  { id: "fi_acupoint", name: "점혈", grade: "영웅", kind: "active", cd: 1.5, aim: "self", anim: "cast", noGcd: true,
    desc: "단계별(1~4)로 치명타와 공격력을 올리는 버프. 탱킹 중 공격 기여를 더한다.",
    limit: "별도 쿨타임 없음(중첩 간격 1.5초), 지속 16초, 최대 4단계. 최대 단계에서 방어 자원 회복이 느려진다.",
    fx: { self: "status/rage" }, steps: [{ do: "custom", fn: "acupoint" }] },
  { id: "fi_suppress", name: "제압", grade: "영웅", kind: "active", cd: 16, cost: { ki: 25 }, aim: "dir", anim: "smash",
    desc: "상태이상에 걸린 적을 눌러 움직임을 막고 추가 공격·위협을 가한다.", limit: "보스에는 짧은 제압 불가 타격만, 큰 공격을 맞으면 중단.",
    fx: { hit: "impacts/ground-slam" }, steps: [{ do: "melee", range: 46, arc: 60, pow: 1.6, max: 1, threat: 6, vsCC: 0.8, ccIfCC: { type: "root", dur: 2.5 } }] },
  {
  id: "fi_collapse", name: "붕권", grade: "전설", kind: "ultimate", cd: 16, cost: { ki: 35 }, aim: "dir", anim: "punch",
  desc: "기절·그로기 상태의 적을 무너뜨리는 강력한 붕권. 조건이 맞지 않아도 묵직한 피해와 큰 위협을 준다.",
  limit: "상태이상 대상에게 추가 피해를 주며 보스 그로기 누적에도 유용하다.",
  fx: { hit: "explosions/plasma-explosion", palette: ["#200800", "#802008", "#e05020", "#ffa040", "#ffe8a0", "#ffffff"] },
  steps: [{ do: "melee", range: 58, arc: 78, pow: 3.5, max: 1, threat: 12, vsCC: 0.8, groggy: 34, critBonus: 0.1 }],
},
  {
  id: "fi_kingblow", name: "권왕일격", grade: "전설", kind: "ultimate", cd: 25, cost: { ki: 40 }, aim: "dir", anim: "punch",
  desc: "점혈의 힘을 실은 권왕의 연속 일격. 두 번의 강타로 적을 밀어내고 짧은 시간 공격과 방어가 강화된다.",
  limit: "점혈 4단계 또는 제압 직후에는 첫 타격이 더 강해진다.",
  fx: { hit: "explosions/cartoon-pow", area: "impacts/ground-slam" },
  steps: [
    { do: "melee", range: 64, arc: 90, pow: 4.2, max: 1, threat: 14, ifAcupoint4: 0.8, knock: 80, groggy: 50 },
    { do: "buff", target: "self", id: "king_resolve", dur: 4, mods: { dmg: 0.18, dr: 0.08 } },
  ],
},
]);

// ─────────────────────────── 3. 궁수 ───────────────────────────
add("archer", [
  { id: "ar_shot", name: "기본 사격", grade: "일반", kind: "basic", aspd: 0.75, aim: "dir", anim: "shoot", extra: true,
    desc: "활로 화살 한 발을 쏜다. (기획서에 없던 기본 공격 — 다른 직업과 조작감을 맞추기 위해 추가)", limit: "피해량 낮음.",
    fx: { proj: "projectiles/arrow", hit: "impacts/hit-spark" }, steps: [{ do: "proj", speed: 520, range: 300, pow: 0.7, radius: 5 }] },
  { id: "ar_mastery", name: "보우 마스터리", grade: "일반", kind: "passive",
    desc: "활 착용 시 원거리 명중·대미지·공격 속도를 높인다.", limit: "모든 보너스에 상한.",
    passive: { mods: { dmg: 0.08, aspd: 0.08 } } },
  { id: "ar_double", name: "더블 샷", grade: "일반", kind: "active", cd: 1.2, cost: { mp: 4 }, aim: "dir", anim: "shoot",
    desc: "대상에게 화살 2발을 빠르게 발사하는 기본 주력기.", limit: "기본 자원 비용.",
    fx: { proj: "projectiles/arrow", hit: "impacts/hit-spark" }, steps: [{ do: "proj", speed: 560, range: 320, pow: 0.75, radius: 5, count: 2, burst: 0.1 }] },
  { id: "ar_regain", name: "마나 리게인", grade: "일반", kind: "passive",
    desc: "공격 적중 시 일정 확률(30%)로 MP 회복.", limit: "발동 확률과 초당 회복 상한, 발동 내부 쿨타임 1.5초.",
    passive: { trigger: { on: "hit", chance: 0.3, icd: 1.5, gain: { mpPct: 0.03 } } } },
  { id: "ar_triple", name: "트리플 샷", grade: "희귀", kind: "active", cd: 3, cost: { mp: 8 }, aim: "dir", anim: "shoot",
    desc: "화살 3발을 연속 발사해 단일 대상 피해를 강화한다.", limit: "더블 샷보다 자원 비용이 높고 타격당 피해는 낮게.",
    fx: { proj: "projectiles/arrow", hit: "impacts/hit-spark" }, steps: [{ do: "proj", speed: 580, range: 330, pow: 0.7, radius: 5, count: 3, burst: 0.09 }] },
  { id: "ar_multi", name: "멀티 샷", grade: "희귀", kind: "active", cd: 5, cost: { mp: 12 }, aim: "dir", anim: "shoot",
    desc: "전방 부채꼴의 다수 적을 공격하는 사냥기.", limit: "표적 수·거리별 피해 감소.",
    fx: { proj: "projectiles/arrow", hit: "impacts/hit-spark" }, steps: [{ do: "proj", speed: 500, range: 260, pow: 0.85, radius: 5, count: 5, spread: 50, falloff: 0.4 }] },
  { id: "ar_entangle", name: "인탱글", grade: "희귀", kind: "active", cd: 9, cost: { mp: 14 }, aim: "point", range: 260, anim: "shoot",
    desc: "적을 묶어 이동 속도와 회피율을 낮춘다.", limit: "일반 적 중심, 보스는 면역 또는 짧은 감쇠.",
    fx: { area: "nature/root-snare" }, steps: [{ do: "area", radius: 48, pow: 0.5, telegraph: 0.2, cc: { type: "root", dur: 2.5 }, status: { type: "slow", dur: 4, v: 0.4 } }] },
  { id: "ar_lethal", name: "리썰 샷", grade: "영웅", kind: "active", cd: 4.5, cost: { mp: 14 }, aim: "dir", anim: "shoot",
    desc: "적을 꿰뚫는 강력한 한 발. 줄지어 선 적 3명까지 관통하고 방어력을 크게 약화한다(25%).", limit: "약화 비중첩.",
    fx: { proj: "ice/ice-lance", palette: ["#200810", "#801830", "#d04060", "#ff90a0", "#ffe0e8", "#ffffff"], hit: "impacts/crit-hit" },
    steps: [{ do: "proj", speed: 760, range: 400, pow: 4.8, radius: 8, pierce: 2, critBonus: 0.2, status: { type: "weaken", dur: 8, v: 0.25 } }] },
  { id: "ar_evasion", name: "이베이젼", grade: "영웅", kind: "active", cd: 10, cost: { mp: 10 }, aim: "self", anim: "cast",
    desc: "7초간 회피율 60%, 이동 속도 30%, 공격 속도 30%, 주는 피해 20%가 오른다. 피하면서 쏘는 궁수의 핵심 버프.", limit: "중첩 불가.",
    fx: { self: "status/haste" }, steps: [{ do: "buff", target: "self", id: "evasion", dur: 7, mods: { evade: 0.6, move: 0.3, aspd: 0.3, dmg: 0.2 } }] },
  { id: "ar_absolute", name: "앱솔루트 애로우", grade: "영웅", kind: "active", cd: 13, cost: { mp: 18 }, aim: "self", anim: "cast",
    desc: "12초간 사거리 +50%, 적 방어 50% 관통, 주는 피해 +30%, 치명타 +15%p, 공격 속도 +25%.", limit: "중첩 불가.",
    fx: { self: "arcane/spell-charge", palette: ["#201808", "#806018", "#d0a830", "#ffe080", "#fff8d0", "#ffffff"] },
    steps: [{ do: "buff", target: "self", id: "absolute", dur: 12, mods: { range: 0.5, pen: 0.5, dmg: 0.3, crit: 0.15, aspd: 0.25 } }] },
  // 영웅 공격기 추가
  { id: "ar_storm", name: "스톰 애로우", grade: "영웅", kind: "active", cd: 6, cost: { mp: 16 }, aim: "dir", anim: "shoot",
    desc: "폭풍처럼 화살 10발을 순식간에 연사한다. 한 대상에게 쏟아붓는 단일 폭딜기.", limit: "화살마다 피해는 낮지만 합치면 매우 높다.",
    fx: { proj: "projectiles/arrow", hit: "impacts/hit-spark" }, steps: [{ do: "proj", speed: 640, range: 340, pow: 0.75, radius: 6, count: 10, burst: 0.06 }] },
  { id: "ar_explosion", name: "익스플로젼 애로우", grade: "영웅", kind: "active", cd: 6.5, cost: { mp: 18 }, aim: "dir", anim: "shoot",
    desc: "맞으면 크게 터지는 폭발 화살. 맞은 적에게 큰 피해를 주고 주변 적 8명까지 폭발에 휘말린다.", limit: "폭발 피해는 직격보다 낮다.",
    fx: { proj: "fire/fireball", scale: 0.5, hit: "explosions/small-explosion" }, steps: [{ do: "proj", speed: 560, range: 340, pow: 2.4, radius: 8, explode: { radius: 70, pow: 1.6, max: 8 } }] },
  { id: "ar_pierce", name: "피어싱 애로우", grade: "영웅", kind: "active", cd: 7, cost: { mp: 18 }, aim: "dir", anim: "shoot", cast: 0.25,
    desc: "활시위를 끝까지 당겨 일직선의 모든 적을 꿰뚫는 관통 사격(길이 420). 맞은 적은 3초간 느려진다.", limit: "짧은 조준 0.25초.",
    fx: { line: "projectiles/laser-bolt", palette: ["#08201a", "#18604a", "#30b088", "#80f0c8", "#e0fff4", "#ffffff"] },
    steps: [{ do: "line", length: 420, width: 34, pow: 3.6, telegraph: 0.1, status: { type: "slow", dur: 3, v: 0.35 } }] },
  {
  id: "ar_rain", name: "애로우 레인", grade: "전설", kind: "ultimate", cd: 23, cost: { mp: 35 }, aim: "point", range: 340, anim: "shoot",
  desc: "넓은 범위에 별빛 화살비를 퍼부어 적 무리를 쓸어버린다.",
  limit: "화살 낙하 횟수와 범위를 늘리고 예고 시간을 줄였다.",
  fx: { area: "weather/rain", tick: "projectiles/arrow" },
  steps: [{ do: "area", radius: 112, pow: 0.72, ticks: 10, interval: 0.25, telegraph: 0.48, max: 12 }],
},
  {
  id: "ar_snipe", name: "스나이핑", grade: "전설", kind: "ultimate", cd: 15, cost: { mp: 25 }, aim: "dir", anim: "shoot", cast: 0.55,
  desc: "긴 조준 끝에 초장거리 관통 저격을 날린다. 강력한 일격은 일반 적을 높은 확률로 기절시킨다.",
  limit: "시전 시간이 짧아졌고 사거리·피해·기절 확률이 증가했다.",
  fx: { proj: "projectiles/laser-bolt", palette: ["#201808", "#806018", "#d0a830", "#ffe080", "#fff8d0", "#ffffff"], hit: "impacts/crit-hit" },
  steps: [{ do: "proj", speed: 1250, range: 720, pow: 7.0, radius: 7, pierce: 0, pen: 0.2, critBonus: 0.25, cc: { type: "stun", dur: 1.5, chance: 0.35 } }],
},
  {
  id: "ar_pinpoint", name: "핀포인트 샷", grade: "전설", kind: "ultimate", cd: 18, cost: { mp: 25 }, aim: "dir", anim: "shoot",
  desc: "약점을 꿰뚫는 정밀 사격. 방어를 크게 무시하고 높은 치명타 피해를 노린다.",
  limit: "관통과 치명타 보정이 강화되어 단단한 적과 보스에게 효과적이다.",
  fx: { proj: "projectiles/energy-disc", hit: "impacts/crit-hit" },
  steps: [{ do: "proj", speed: 900, range: 520, pow: 5.4, radius: 7, pen: 0.65, critBonus: 0.45, pierce: 1 }],
},
]);

// ─────────────────────────── 4. 도적 ───────────────────────────
add("rogue", [
  { id: "ro_cut", name: "단검 베기", grade: "일반", kind: "basic", aspd: 0.6, aim: "dir", anim: "stab", extra: true,
    desc: "단검으로 빠르게 벤다. 측·후방 적중 시 틈 획득. (기획서에 없던 기본 공격 — 조작감을 위해 추가)", limit: "틈 획득은 3초에 한 번.",
    fx: { swing: "melee/claw-swipe", hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 40, arc: 80, pow: 0.7, max: 1, gapOnFlank: true }] },
  { id: "ro_twin", name: "쌍날 재빠른 베기", grade: "일반", kind: "active", cd: 4, cost: { mp: 5 }, aim: "dir", anim: "stab",
    desc: "두 번 베며 두 타격 모두 측·후방 적중 시 틈 1중첩 획득.", limit: "틈 획득은 3초에 한 번.",
    fx: { swing: "melee/double-slash", hit: "impacts/hit-spark" }, steps: [{ do: "melee", range: 44, arc: 80, pow: 0.95, hits: 2, gap: 0.1, max: 1, gapOnFlank: true }] },
  { id: "ro_smoke", name: "연막 비껴가기", grade: "일반", kind: "active", cd: 10, cost: { mp: 8 }, aim: "dir", anim: "dash", moveSkill: true,
    desc: "지정 방향 4m(128px) 이동하며 주변 일반 적 명중률을 낮춘다.", limit: "이동 중 무적 없음. 보스 약화 면역.",
    fx: { self: "explosions/smoke-bomb" }, steps: [{ do: "circle", radius: 64, pow: 0, status: { type: "blind", dur: 3, v: 0.4 } }, { do: "dash", dist: 128, speed: 560 }] },
  { id: "ro_footwork", name: "사냥꾼의 발놀림", grade: "일반", kind: "passive",
    desc: "회피 이동 후 첫 근접 공격의 치명타 확률이 증가한다(+30%p).", limit: "3초 발동 창, 발동 내부 쿨타임 6초.",
    passive: { trigger: { on: "move_skill", icd: 6, buff: { id: "footwork", dur: 3, mods: { crit: 0.3 }, consumeOnHit: true } } } },
  { id: "ro_shadowstep", name: "그림자 파고들기", grade: "희귀", kind: "active", cd: 12, cost: { mp: 10 }, aim: "dir", anim: "stab", moveSkill: true,
    desc: "최대 6m(192px) 내 표적의 측면으로 이동해 피해. 후방 적중 시 틈 획득.", limit: "시야·경로 조건, 무적 없음.",
    fx: { self: "arcane/blink-out", hit: "impacts/hit-spark", palette: ["#100818", "#301848", "#6030a0", "#a070e0", "#e0d0ff", "#ffffff"] },
    steps: [{ do: "custom", fn: "shadowstep", range: 192, pow: 1.5 }] },
  { id: "ro_poison", name: "핏빛 독날", grade: "희귀", kind: "active", cd: 14, cost: { mp: 8 }, aim: "self", anim: "cast",
    desc: "다음 근접 타격에 독을 묻혀 5초 지속 피해.", limit: "독 피해 치명타 불가, 기존 독 중첩 불가.",
    fx: { self: "status/poisoned" }, steps: [{ do: "buff", target: "self", id: "poison_blade", dur: 8, mods: {}, nextHit: { status: { type: "poison", dur: 5, pow: 0.45 } } }] },
  { id: "ro_wire", name: "무릎끊기 철사", grade: "희귀", kind: "active", cd: 18, cost: { mp: 12 }, aim: "point", range: 160, anim: "cast",
    desc: "덫을 설치한다. 걸린 일반 적을 넘어뜨리고, 정예·보스는 짧게 감속.", limit: "한 개만 유지, 보스 감속 내부 제한.",
    fx: { area: "scifi/laser-grid" }, steps: [{ do: "device", kind: "wire", dur: 20, radius: 26, hp: 1 }] },
  { id: "ro_check", name: "급소 확인", grade: "희귀", kind: "active", cd: 8, cost: { mp: 8 }, aim: "dir", anim: "stab",
    desc: "대상에게 피해와 급소 표식을 남겨 측·후방에서 틈을 쌓게 한다.", limit: "표적 한 명, 6초 유지, 틈 획득 간격 제한.",
    fx: { hit: "shadow/hex-sigil" }, steps: [{ do: "melee", range: 48, arc: 50, pow: 1.2, max: 1, status: { type: "vitalmark", dur: 6 } }] },
  { id: "ro_open", name: "개방 절개", grade: "영웅", kind: "active", cd: 16, cost: { gap: 1, mp: 10 }, aim: "dir", anim: "stab",
    desc: "틈을 모두 소모해 단일 대상에게 큰 피해.", limit: "틈 1중첩 이상 필요, 반복 적중 피해 감쇠.",
    fx: { swing: "melee/scythe-reap", hit: "impacts/crit-hit" }, steps: [{ do: "melee", range: 48, arc: 50, pow: 1.4, max: 1, perGap: 1.1, consumeGap: true }] },
  { id: "ro_afterimage", name: "잔영 활주", grade: "영웅", kind: "active", cd: 18, cost: { mp: 10 }, aim: "dir", anim: "dash", moveSkill: true,
    desc: "최대 8m(256px) 활주 후 짧은 피해 감소를 얻고 첫 공격을 강화한다.", limit: "받는 피해 감소 15%·2초, 이동 중 무적 없음.",
    fx: { self: "status/haste" }, steps: [{ do: "dash", dist: 256, speed: 700 }, { do: "buff", target: "self", id: "afterimage", dur: 2, mods: { dr: 0.15 }, nextHit: { pow: 0.6 } }] },
  { id: "ro_track", name: "약점 추적", grade: "영웅", kind: "passive",
    desc: "급소 표식 대상 공격 시 피해가 최대 3중첩 증가한다(중첩당 8%).", limit: "표식 종료 시 해제, 대상별 발동 간격 2초.",
    passive: { trigger: { on: "hit_marked", icd: 2, stack: { id: "track", max: 3, per: 0.08 } } } },
  {
  id: "ro_finale", name: "종막: 무음 처형", grade: "전설", kind: "ultimate", cd: 28, cost: { gap: 1 }, aim: "dir", anim: "stab", cast: 0.4, fragile: true,
  desc: "틈을 모아 단일 표적을 처형한다. 대상의 체력이 낮을수록 피해가 크게 증가한다.",
  limit: "준비 시간이 단축되고 사거리·기본 피해·틈 계수가 증가한다. 틈을 모두 소모한다.",
  fx: { self: "shadow/curse", hit: "shadow/dark-explosion" },
  steps: [{ do: "melee", range: 66, arc: 68, pow: 4.6, max: 1, perGap: 1.4, consumeGap: true, execute: 1.1 }],
},
  {
  id: "ro_hunt", name: "밤의 사냥 표식", grade: "전설", kind: "ultimate", cd: 34, cost: { mp: 18 }, aim: "dir", anim: "cast",
  desc: "표적을 사냥감으로 지정한다. 표식이 유지되는 동안 도적의 공격력과 치명타가 상승하고 측·후방 공격으로 틈을 얻는다.",
  limit: "표식 지속시간이 늘고 시전자에게 강력한 사냥꾼 강화 효과를 부여한다.",
  fx: { hit: "shadow/hex-sigil", palette: ["#180008", "#500018", "#a02040", "#ff6080", "#ffd0e0", "#ffffff"] },
  steps: [{ do: "custom", fn: "huntmark", range: 340, dur: 10 }],
},
]);

// ─────────────────────────── 5. 마법사 ───────────────────────────
add("mage", [
  { id: "ma_arcane", name: "비전 투사", grade: "일반", kind: "basic", aspd: 0.85, cost: { mp: 1 }, aim: "dir", anim: "cast",
    desc: "낮은 마나 비용의 기본 주문. 대상과 아주 가까운 적에게 소량의 비전 피해.", limit: "짧은 시전, 광역 피해 제한.",
    fx: { proj: "arcane/arcane-orb", scale: 0.6, hit: "arcane/mana-burst" }, steps: [{ do: "proj", speed: 420, range: 300, pow: 0.9, radius: 7, explode: { radius: 28, pow: 0.3, max: 3 } }] },
  { id: "ma_frostseal", name: "서리 봉인", grade: "일반", kind: "active", cd: 10, cost: { mp: 14 }, aim: "point", range: 260, anim: "cast",
    desc: "지정 지점에 냉기 문양을 두어 적을 감속한다.", limit: "적별 1회, 보스 감속은 매우 짧음.",
    fx: { area: "ice/frost-nova" }, steps: [{ do: "area", radius: 64, pow: 0.9, telegraph: 0.25, status: { type: "slow", dur: 3, v: 0.5 }, freezeChance: 0.25 }] },
  { id: "ma_precise", name: "정밀 시전", grade: "일반", kind: "passive",
    desc: "1.5초 정지하면 다음 직접 피해 주문을 강화한다(+25%).", limit: "이동·피격으로 준비 취소, 발동 내부 쿨타임 5초.",
    passive: { trigger: { on: "still", t: 1.5, icd: 5, buff: { id: "precise", dur: 6, mods: {}, nextHit: { mul: 0.25 } } } } },
  { id: "ma_firetrail", name: "화염 궤적", grade: "희귀", kind: "active", cd: 8, cost: { mp: 16 }, aim: "dir", anim: "cast",
    desc: "전방 경로를 불태워 피해와 약한 화상을 부여.", limit: "같은 시전의 직접 피해 횟수 제한.",
    fx: { line: "fire/fire-ring", tick: "status/burning" }, steps: [{ do: "line", length: 220, width: 30, pow: 1.4, telegraph: 0.15, status: { type: "burn", dur: 3, pow: 0.2 } }] },
  { id: "ma_blink", name: "차원 도약", grade: "희귀", kind: "active", cd: 12, cost: { mp: 12 }, aim: "dir", anim: "cast", moveSkill: true,
    desc: "지정 방향으로 최대 5m(160px) 순간 이동해 위치를 바꾼다.", limit: "무적·피해 감소·상태이상 해제 없음.",
    fx: { self: "arcane/blink-out", end: "arcane/blink-in" }, steps: [{ do: "blink", dist: 160 }] },
  { id: "ma_echo", name: "잔향 룬", grade: "희귀", kind: "passive",
    desc: "서로 다른 주문을 이어 쓰면 잔향을 얻고 다음 광역 주문을 강화(중첩당 15%).", limit: "최대 2중첩·12초 유지, 같은 주문 반복은 불인정, 발동 내부 쿨타임 5초.",
    passive: { trigger: { on: "cast_diff", icd: 5, stack: { id: "echo", max: 2, per: 0.15, dur: 12, aoeOnly: true } } } },
  { id: "ma_gravity", name: "중력 우물", grade: "희귀", kind: "active", cd: 16, cost: { mp: 20 }, aim: "point", range: 260, anim: "cast",
    desc: "작은 중력장을 열어 일반 적을 모으고 감속.", limit: "정예 효과 감소, 보스 강제 이동 면역.",
    fx: { area: "shadow/black-hole" }, steps: [{ do: "zone", at: "point", radius: 90, dur: 2.5, interval: 0.25, pow: 0.12, pull: 70, status: { type: "slow", dur: 1, v: 0.4 } }] },
  { id: "ma_meteor", name: "유성우 낙점", grade: "영웅", kind: "active", cd: 15, cost: { mp: 30 }, aim: "point", range: 300, anim: "cast", cast: 0.6,
    desc: "예고 뒤 지점에 유성 세 발을 떨어뜨려 광역 피해.", limit: "시전 중 이동·방해 시 취소, 대상별 피해 상한.",
    fx: { area: "fire/meteor", scale: 0.5 }, steps: [{ do: "area", radius: 56, pow: 1.5, ticks: 3, interval: 0.35, telegraph: 0.7, scatter: 36, status: { type: "burn", dur: 3, pow: 0.15 } }] },
  { id: "ma_cut", name: "주문 절단", grade: "영웅", kind: "active", cd: 18, cost: { mp: 10 }, aim: "dir", anim: "cast",
    desc: "차단 가능한 적 주문을 끊는다.", limit: "차단 불가 보스 패턴에는 무효, 대상별 내부 제한.",
    fx: { proj: "projectiles/magic-missile", hit: "lightning/zap-hit" }, steps: [{ do: "proj", speed: 900, range: 320, pow: 0.8, radius: 8, interrupt: true }] },
  { id: "ma_recall", name: "마력 회수", grade: "영웅", kind: "active", cd: 18, aim: "self", anim: "channel",
    desc: "2초 집중해 마나를 회복한다(최대 MP 35%).", limit: "방해받으면 회복량이 절반이며 1회 회복량에 상한.",
    fx: { self: "arcane/rune-circle" }, steps: [{ do: "channel", dur: 2, mpPct: 0.35 }] },
  {
  id: "ma_doom", name: "종말성 낙하", grade: "전설", kind: "ultimate", cd: 34, cost: { mp: 50 }, aim: "point", range: 360, anim: "cast", cast: 1.15, fragile: true,
  desc: "짧은 시전 뒤 거대한 별의 파편을 떨어뜨려 넓은 범위를 초토화한다.",
  limit: "시전 시간이 줄고 범위·피해 상한이 증가했다. 보스에게도 기존보다 높은 피해를 준다.",
  fx: { area: "explosions/big-explosion", pre: "arcane/magic-circle-cast" },
  steps: [{ do: "area", radius: 135, pow: 7.5, telegraph: 0.75, capPct: 0.65, max: 18 }],
},
  {
  id: "ma_resonance", name: "차원 공명장", grade: "전설", kind: "ultimate", cd: 38, cost: { mp: 32 }, aim: "point", range: 260, anim: "cast",
  desc: "고정된 공명장 안에서 직접 피해 주문을 네 번 복제한다. 복제 주문은 원래 피해의 55% 위력을 가진다.",
  limit: "공명장 크기·지속시간·복제 횟수·복제 피해가 모두 증가했다. 궁극기는 복제하지 않는다.",
  fx: { area: "arcane/portal" },
  steps: [{ do: "zone", at: "point", radius: 150, dur: 14, kind: "resonance", charges: 4, copyMul: 0.55 }],
},
]);

// ─────────────────────────── 6. 성직자 ───────────────────────────
add("priest", [
  { id: "pr_bolt", name: "백광탄", grade: "일반", kind: "basic", aspd: 0.85, aim: "dir", anim: "cast",
    desc: "적 하나에 빛 피해를 주는 기본 공격 및 성광 수급기.", limit: "딜러 기본 공격보다 낮은 피해. 성광 획득 초당 상한.",
    fx: { proj: "projectiles/plasma-shot", palette: ["#201808", "#806018", "#d0a830", "#ffe080", "#fff8d0", "#ffffff"], hit: "holy/smite", hitScale: 0.4 },
    steps: [{ do: "proj", speed: 460, range: 300, pow: 0.72, radius: 7, gainOnHit: { holy: 6 } }] },
  { id: "pr_answer", name: "성가의 응답", grade: "일반", kind: "active", cd: 6, cost: { holy: 15, mp: 6 }, aim: "ally", range: 260, anim: "cast",
    desc: "아군 한 명을 즉시 치유하고, 체력이 낮다면(40% 이하) 짧은 지속 회복을 추가한다.", limit: "성광 비용, 지속 회복은 중첩되지 않는다.",
    fx: { self: "holy/heal" }, steps: [{ do: "heal", target: "ally", pow: 1.6, lowHot: { pow: 0.25, dur: 4, interval: 1 } }] },
  { id: "pr_afterglow", name: "잔광의 서약", grade: "일반", kind: "passive",
    desc: "직접 치유한 아군을 표식하고, 성직자 공격 시 표식 아군을 소량 추가 회복.", limit: "대상별 발동 간격(내부 쿨타임 5초).",
    passive: { trigger: { on: "hit", icd: 5, healMarked: 0.4 } } },
  { id: "pr_shard", name: "성역의 편린", grade: "희귀", kind: "active", cd: 16, cost: { holy: 20, mp: 10 }, aim: "point", range: 240, anim: "cast",
    desc: "지정 구역 안 아군을 소량 회복하고 적에게 낮은 빛 피해.", limit: "성광 비용, 구역 비중첩·발동 횟수 제한.",
    fx: { area: "holy/heal-aoe" }, steps: [{ do: "zone", at: "point", radius: 72, dur: 4, interval: 1, heal: 0.35, pow: 0.3 }] },
  { id: "pr_bell", name: "징벌의 종", grade: "희귀", kind: "active", cd: 18, cost: { mp: 12 }, aim: "dir", anim: "cast",
    desc: "적에게 빛 피해를 주고 차단 가능한 시전을 중단한다.", limit: "보스 경직 면역, 차단 불가 기술에는 피해만.",
    fx: { proj: "projectiles/magic-missile", palette: ["#201808", "#806018", "#d0a830", "#ffe080", "#fff8d0", "#ffffff"], hit: "holy/smite" },
    steps: [{ do: "proj", speed: 700, range: 300, pow: 1.1, radius: 8, interrupt: true }] },
  { id: "pr_halo", name: "성광 폭발", grade: "희귀", kind: "active", cd: 11, cost: { holy: 18, mp: 10 }, aim: "point", range: 280, anim: "cast",
    desc: "지정한 지점에 성광을 폭발시켜 넓은 범위의 적에게 강한 빛 피해를 준다.", limit: "반경 112, 최대 12명에게 적중.",
    fx: { area: "holy/smite", pre: "arcane/magic-circle-cast" },
    steps: [{ do: "area", radius: 112, pow: 2.8, telegraph: 0.4, max: 12 }] },
  { id: "pr_sanctum", name: "성역 강림", grade: "희귀", kind: "active", cd: 15, cost: { holy: 22, mp: 14 }, aim: "point", range: 280, anim: "cast",
    desc: "넓은 성역에 빛의 파동을 두 차례 일으켜 적을 공격하고 아군을 회복한다.", limit: "반경 128, 최대 14명, 2회 타격.",
    fx: { area: "holy/holy-pillar", pre: "holy/heal-aoe" },
    steps: [{ do: "area", radius: 128, pow: 2.35, ticks: 2, interval: 0.5, telegraph: 0.45, max: 14, healAllies: 0.35 }] },
  { id: "pr_ward", name: "수호 문양", grade: "희귀", kind: "active", cd: 18, cost: { holy: 20, mp: 8 }, aim: "ally", range: 260, anim: "cast",
    desc: "아군 한 명에게 짧은 보호막 부여.", limit: "성광 비용, 보호막 비중첩.",
    fx: { self: "holy/divine-shield" }, steps: [{ do: "shield", target: "ally", pow: 2.0, dur: 6 }] },
  { id: "pr_relief", name: "구휼의 증표", grade: "희귀", kind: "passive",
    desc: "체력이 낮은(50% 이하) 아군에게 직접 치유 시 회복량을 높인다(+30%).", limit: "대상별 내부 재발동 제한(12초), 지속 회복 틱에는 발동하지 않음.",
    passive: { trigger: { on: "heal_low", icd: 12, mul: 0.3 } } },
  { id: "pr_corridor", name: "황혼의 회랑", grade: "영웅", kind: "active", cd: 20, cost: { holy: 25, mp: 15 }, aim: "point", range: 220, anim: "cast", exclusive: "pr_hymn",
    desc: "지정 지점에서 파티 피해를 소폭(10%) 줄이고 주기적으로 소량 회복하는 지원 구역.", limit: "성광 비용, 구역 고정, 회복 횟수·감소량 제한. 성가의 축복과 교체 장착.",
    fx: { area: "holy/sunburst" }, steps: [{ do: "zone", at: "point", radius: 84, dur: 6, interval: 1.5, heal: 0.25, dr: 0.1 }] },
  { id: "pr_hymn", name: "성가의 축복", grade: "영웅", kind: "active", cd: 20, cost: { holy: 20 }, aim: "self", anim: "cast", exclusive: "pr_corridor",
    desc: "4초간 파티 공격력 4% 또는 방어력 5% 중 하나를 올린다(사용할 때마다 번갈아 선택).", limit: "두 축복은 동시에 유지할 수 없고, 대상별 적용 1회. 황혼의 회랑과 교체 장착.",
    fx: { self: "holy/blessing" }, steps: [{ do: "custom", fn: "hymn", dur: 4 }] },
  { id: "pr_convert", name: "환원화", grade: "영웅", kind: "active", cd: 12, cost: { holy: 15 }, aim: "dir", anim: "cast",
    desc: "적에게 낮은~중간 피해를 주고 일부를 생명력이 가장 낮은 아군에게 회복으로 전환.", limit: "성광 비용, 회복 상한. 피해 계수 제한.",
    fx: { proj: "shadow/life-steal", hit: "holy/smite", hitScale: 0.5 }, steps: [{ do: "proj", speed: 520, range: 280, pow: 1.3, radius: 8, lifeshareLowest: 0.6 }] },
  { id: "pr_radiance", name: "천상의 광휘", grade: "영웅", kind: "active", cd: 19, cost: { holy: 32, mp: 18 }, aim: "point", range: 300, anim: "cast", cast: 0.55,
    desc: "넓은 지점에 연속으로 빛기둥을 내려 적 무리를 크게 약화시키고 아군을 회복한다.", limit: "반경 155, 최대 16명, 2회 타격. 보스에게는 피해가 일부 감소.",
    fx: { area: "holy/holy-pillar", pre: "holy/sunburst" },
    steps: [{ do: "area", radius: 155, pow: 4.2, ticks: 2, interval: 0.5, telegraph: 0.55, max: 16, bossMul: 0.85, healAllies: 0.45 }] },
  { id: "pr_martyr", name: "순교자의 각인", grade: "영웅", kind: "passive",
    desc: "아군이 위기(체력 30% 이하)에 빠질 때 자동으로 작은 보호막을 제공.", limit: "대상별 재발동 간격 20초, 자동 부활·치명타 무효 없음.",
    passive: { trigger: { on: "ally_low", icd: 20, shield: 0.12 } } },
  {
  id: "pr_dawn", name: "새벽의 재판", grade: "전설", kind: "ultimate", cd: 38, cost: { holy: 50 }, aim: "point", range: 280, anim: "cast", cast: 0.65,
  desc: "새벽의 빛이 지정 구역을 심판해 적에게 피해를 주고 아군을 크게 회복시킨다.",
  limit: "공격력과 회복량이 증가하고 보스에게 주는 피해 감소도 완화됐다.",
  fx: { area: "holy/holy-pillar" },
  steps: [{ do: "area", radius: 118, pow: 2.4, telegraph: 0.35, bossMul: 0.85, healAllies: 1.4, max: 18 }],
},
  {
  id: "pr_belltower", name: "자비의 종탑", grade: "전설", kind: "ultimate", cd: 38, cost: { holy: 45 }, aim: "self", anim: "channel",
  desc: "종탑의 성역을 펼쳐 주변 파티원을 지속 회복하고, 침입한 적에게 신성한 파동을 반복해서 가한다.",
  limit: "범위·지속시간·회복과 피해가 증가한다. 이동하면 성역이 종료된다.",
  fx: { area: "holy/sunburst" },
  steps: [{ do: "zone", at: "self", radius: 150, dur: 8, interval: 0.8, heal: 0.72, pow: 0.28, endOnMove: true }],
},
  {
  id: "pr_apocalypse", name: "종말의 대심판", grade: "전설", kind: "ultimate", cd: 34, cost: { holy: 50, mp: 25 }, aim: "point", range: 330, anim: "cast", cast: 0.7,
  desc: "광대한 성역에 세 차례 심판의 빛을 쏟아부어 적을 공격하고 빛에 닿은 아군을 크게 회복한다.",
  limit: "범위·피해·아군 회복이 증가하고 시전 시간과 쿨타임이 줄었다.",
  fx: { area: "holy/holy-pillar", pre: "arcane/magic-circle-cast" },
  steps: [{ do: "area", radius: 195, pow: 6.8, ticks: 3, interval: 0.42, telegraph: 0.6, max: 24, bossMul: 0.85, healAllies: 0.95 }],
},
]);

// ─────────────────────────── 7. 대장장이 ───────────────────────────
add("smith", [
  { id: "sm_hammer", name: "대장 망치질", grade: "일반", kind: "basic", aspd: 0.9, aim: "dir", anim: "smash",
    desc: "망치로 기본 공격을 가하며 위협을 생성하고 부품을 모은다.", limit: "부품 획득은 3초당 1개, 최대 3개. 피해량은 딜러보다 낮게.",
    fx: { hit: "impacts/blunt-hit" }, steps: [{ do: "melee", range: 44, arc: 90, pow: 0.75, max: 3, threat: 2.0, partsOnHit: true }] },
  { id: "sm_rivet", name: "리벳 방패", grade: "일반", kind: "active", cd: 6, aim: "dir", anim: "guard",
    desc: "전방의 피해를 줄이고(60%) 방어 성공 시 부품 1개를 얻는다.", limit: "정면 공격만 적용, 부품 획득 내부 쿨다운, 방어 중 이동 제한.",
    fx: { self: "impacts/shield-block" }, steps: [{ do: "custom", fn: "rivet", dur: 1.6, dr: 0.6, arc: 140 }] },
  { id: "sm_armor", name: "중장갑 설계", grade: "일반", kind: "passive",
    desc: "최대 체력과 방어력을 높인다(+10%).", limit: "회피·이동속도는 낮게.",
    passive: { mods: { hpPct: 0.1, defPct: 0.1 } } },
  { id: "sm_taunt", name: "도발의 망치", grade: "희귀", kind: "active", cd: 9, aim: "self", anim: "smash",
    desc: "주변 적을 도발해 위협을 자신에게 집중시키고 타격 피해를 준다.", limit: "일반 적 도발 지속시간 제한(3초), 보스는 위협 수치만 조정.",
    fx: { area: "impacts/ground-slam" }, steps: [{ do: "taunt", radius: 110, dur: 3 }, { do: "circle", radius: 60, pow: 0.8, threat: 3 }] },
  { id: "sm_mine", name: "진동 지뢰", grade: "희귀", kind: "active", cd: 12, cost: { parts: 1 }, aim: "point", range: 180, anim: "cast",
    desc: "지정 지점에 지뢰를 설치해 적의 접근을 늦추고 위협을 생성한다.", limit: "장치 한도 포함, 한 개만 유지, 보스 감속 약화.",
    fx: { area: "explosions/dirt-explosion", scale: 0.5 }, steps: [{ do: "device", kind: "mine", dur: 25, radius: 50, pow: 1.4, hp: 1 }] },
  { id: "sm_drone", name: "축전 방벽 드론", grade: "희귀", kind: "active", cd: 18, cost: { parts: 1 }, aim: "ally", range: 260, anim: "cast",
    desc: "지정 아군 또는 자신에게 짧은 피해 흡수막을 제공한다.", limit: "보호막 비중첩, 탱커 자신 대상 시 흡수량 감소(60%).",
    fx: { self: "scifi/force-field" }, steps: [{ do: "shield", target: "ally", pow: 1.8, dur: 6, selfMul: 0.6 }] },
  { id: "sm_repair", name: "자동 수리", grade: "희귀", kind: "passive",
    desc: "방어 장치가 만료되기 전 직접 회수하면 부품 일부를 돌려받는다.", limit: "20초마다 1회, 파괴·폭발한 장치 환급 불가.",
    passive: { trigger: { on: "device_recall", icd: 20, gain: { parts: 1 } } } },
  { id: "sm_wall", name: "철벽 전개", grade: "영웅", kind: "active", cd: 20, cost: { parts: 1 }, aim: "dir", anim: "smash",
    desc: "전방에 임시 방벽을 설치해 뒤에 있는 파티원이 받는 투사체 피해를 막는다.", limit: "장치 한도 포함, 지속시간(8초)·내구도 제한.",
    fx: { area: "scifi/force-field" }, steps: [{ do: "device", kind: "wall", dur: 8, dist: 44, hp: 8 }] },
  { id: "sm_moth", name: "수리 나방 군집", grade: "영웅", kind: "active", cd: 20, cost: { parts: 1 }, aim: "ally", range: 260, anim: "cast",
    desc: "드론이 생명력이 낮은 아군 또는 자신을 짧게 수리한다.", limit: "낮은 회복량, 한 대상 고정. 성직자 대체 불가.",
    fx: { self: "critters/butterfly", palette: ["#201808", "#806018", "#d0a830", "#ffe080", "#fff8d0", "#ffffff"] },
    steps: [{ do: "heal", target: "ally", pow: 0.2, hot: { pow: 0.25, dur: 5, interval: 1 } }] },
  { id: "sm_circuit", name: "교차 회로", grade: "영웅", kind: "active", cd: 18, aim: "self", anim: "cast",
    desc: "설치한 방어 장치 두 개를 연결해 적의 진입을 견제하고 아군 방어를 보조한다.", limit: "장치 2개 필요, 적중 주기 제한, 보스 감속 면역.",
    fx: { line: "lightning/spark-arc" }, steps: [{ do: "custom", fn: "circuit", dur: 6 }] },
  {
  id: "sm_fortress", name: "대장간 요새", grade: "전설", kind: "ultimate", cd: 40, cost: { parts: 2 }, aim: "self", anim: "smash",
  desc: "자신과 주변 파티원에게 강력한 보호막을 부여하고, 적의 위협을 끌어오며 공격과 방어를 강화한다.",
  limit: "보호막·도발 범위가 증가하고 파티 전체에 짧은 공격·방어 강화 효과를 추가한다.",
  fx: { area: "holy/feather-burst", palette: ["#200c00", "#803000", "#e06010", "#ffa050", "#ffe0b0", "#ffffff"] },
  steps: [
    { do: "shield", target: "party", radius: 190, pow: 3.3, dur: 6 },
    { do: "taunt", radius: 200, dur: 5 },
    { do: "buff", target: "party", radius: 190, id: "forge_oath", dur: 5, mods: { dr: 0.12, dmg: 0.08 } },
  ],
},
  {
  id: "sm_golem", name: "수호 골렘 7호", grade: "전설", kind: "ultimate", cd: 38, cost: { parts: 2 }, aim: "point", range: 200, anim: "cast",
  desc: "강철 수호 골렘을 소환한다. 골렘은 적을 쫓아 망치로 공격하고 주변 적의 위협을 끌어오며 주인을 대신해 공격을 받아낸다.",
  limit: "소환 시간·내구도·공격력이 증가하고 주변 적도 충격파에 휘말린다.",
  fx: { area: "spawn/summon-rise" },
  steps: [{ do: "device", kind: "golem", dur: 16, hp: 16, pow: 1.6 }],
},
]);

// ─────────────────────────── 중반 단계를 채우는 추가 스킬 ───────────────────────────
add("rogue", [
  { id: "ro_fan", name: "칼날 부채", grade: "희귀", kind: "active", cd: 7, cost: { mp: 10 }, aim: "dir", anim: "stab",
    desc: "단검 다섯 자루를 부채꼴로 던져 앞쪽 적들을 꿰뚫는다.", limit: "멀리 갈수록 피해가 줄어든다.",
    fx: { proj: "projectiles/arrow", hit: "impacts/hit-spark", palette: ["#100818", "#301848", "#6030a0", "#a070e0", "#e0d0ff", "#ffffff"] },
    steps: [{ do: "proj", speed: 560, range: 240, pow: 0.9, radius: 6, count: 5, spread: 60, pierce: 1, falloff: 0.3 }] },
  { id: "ro_bloodmoon", name: "혈월참", grade: "영웅", kind: "active", cd: 14, cost: { mp: 16 }, aim: "self", anim: "spin",
    desc: "붉은 달처럼 주위를 크게 베어 주변 적 모두에게 큰 피해를 주고 5초간 출혈(독) 피해를 남긴다.", limit: "대상 8명까지.",
    fx: { swing: "melee/spin-slash", hit: "impacts/crit-hit", palette: ["#200408", "#701020", "#d02a40", "#ff6a7a", "#ffd0d8", "#ffffff"] },
    steps: [{ do: "circle", radius: 84, pow: 2.4, max: 8, status: { type: "poison", dur: 5, pow: 0.35 } }] },
]);
add("mage", [
  { id: "ma_chain", name: "연쇄 번개", grade: "희귀", kind: "active", cd: 7, cost: { mp: 16 }, aim: "dir", anim: "cast",
    desc: "번개 구슬을 날려, 맞은 자리에서 번개가 튀어 주변 적 5명까지 감전시킨다.", limit: "튄 번개는 직격보다 약하다.",
    fx: { proj: "lightning/ball-lightning", scale: 0.5, hit: "lightning/chain-lightning" },
    steps: [{ do: "proj", speed: 520, range: 300, pow: 1.8, radius: 8, explode: { radius: 80, pow: 1.0, max: 5 }, status: { type: "shock", dur: 2 } }] },
  { id: "ma_blizzard", name: "눈보라", grade: "영웅", kind: "active", cd: 16, cost: { mp: 28 }, aim: "point", range: 280, anim: "cast",
    desc: "지정한 곳에 2초간 눈보라를 일으켜 계속 피해를 주고 크게 느리게 만든다.", limit: "대상 10명까지.",
    fx: { area: "weather/snow", tick: "ice/ice-lance" },
    steps: [{ do: "area", radius: 100, pow: 0.75, ticks: 7, interval: 0.3, telegraph: 0.3, max: 10, status: { type: "slow", dur: 2, v: 0.5 } }] },
]);
add("priest", [
  { id: "pr_lightray", name: "심판의 빛", grade: "희귀", kind: "active", cd: 8, cost: { holy: 15 }, aim: "point", range: 260, anim: "cast",
    desc: "지정한 곳에 빛줄기를 내려 적에게 피해를 주고, 빛에 닿은 아군은 회복시킨다.", limit: "짧은 예고(0.3초).",
    fx: { area: "holy/smite" }, steps: [{ do: "area", radius: 60, pow: 2.0, telegraph: 0.3, max: 6, healAllies: 0.6 }] },
  { id: "pr_grace", name: "은총의 물결", grade: "영웅", kind: "active", cd: 16, cost: { holy: 25, mp: 12 }, aim: "self", anim: "cast",
    desc: "주변 파티원 모두를 크게 회복시키고 6초 동안 꾸준히 더 회복시킨다.", limit: "주변 220 안의 파티원.",
    fx: { self: "holy/heal-aoe" }, steps: [{ do: "heal", target: "party", radius: 220, pow: 1.6, hot: { pow: 0.25, dur: 6, interval: 1 } }] },
]);
add("smith", [
  { id: "sm_rivetgun", name: "리벳 연사", grade: "희귀", kind: "active", cd: 6, aim: "dir", anim: "cast",
    desc: "리벳 총으로 쇠못 네 발을 빠르게 쏜다. 대장장이의 원거리 공격.", limit: "사거리 중간.",
    fx: { proj: "projectiles/laser-bolt", scale: 0.5, palette: ["#201008", "#604020", "#a07040", "#e0b070", "#fff0d0", "#ffffff"], hit: "impacts/hit-spark" },
    steps: [{ do: "proj", speed: 620, range: 260, pow: 0.8, radius: 6, count: 4, burst: 0.08, threat: 1.5 }] },
  { id: "sm_overload", name: "과부하 해머", grade: "영웅", kind: "active", cd: 14, cost: { parts: 1 }, aim: "dir", anim: "smash",
    desc: "망치에 과전류를 흘려 앞쪽을 크게 내려친다. 4명까지 큰 피해·기절·밀쳐내기.", limit: "부품 1개 소모.",
    fx: { hit: "lightning/thunderclap", swing: "melee/hammer-smash" }, steps: [{ do: "melee", range: 60, arc: 120, pow: 2.8, max: 4, knock: 50, cc: { type: "stun", dur: 0.8 }, groggy: 20, threat: 4 }] },
]);

// ─────────────────────────── 최종 단계 신화 스킬 (각 직업의 마지막 성장 단계에서 해금) ───────────────────────────
add("sword", [{ id: "sw_final", name: "검성 일섬", grade: "신화", kind: "ultimate", cd: 40, cost: { ki: 55 }, aim: "dir", anim: "dash",
  desc: "전방을 꿰뚫는 초월의 발도. 긴 직선 범위의 적을 한꺼번에 베고, 8초간 공격력이 35% 상승한다.",
  limit: "직선 범위와 대상 수에 강점이 있는 검사 최종기.",
  fx: { line: "melee/sword-slash", self: "status/rage" },
  steps: [{ do: "line", length: 420, width: 82, pow: 11.5, telegraph: 0.25, groggy: 70 }, { do: "buff", target: "self", id: "sword_saint", dur: 8, mods: { dmg: 0.35 } }] }]);
add("fist", [{ id: "fi_final", name: "권왕멸천", grade: "신화", kind: "ultimate", cd: 36, cost: { ki: 45 }, aim: "dir", anim: "dash", moveSkill: true,
  desc: "적진 한가운데로 돌진해 대지를 내려찍는다. 넓은 충격파로 적을 제압하고, 10초간 공격력 35% 증가와 받는 피해 30% 감소를 얻는다.",
  limit: "보스는 기절 대신 큰 그로기를 받는다.",
  fx: { self: "status/rage", area: "explosions/plasma-explosion", palette: ["#200800", "#802008", "#e05020", "#ffa040", "#ffe8a0", "#ffffff"] },
  steps: [{ do: "buff", target: "self", id: "fist_king", dur: 10, mods: { dmg: 0.35, dr: 0.3 } }, { do: "dash", dist: 150, speed: 760 }, { do: "circle", radius: 145, pow: 8.0, max: 16, threat: 12, cc: { type: "stun", dur: 1.4 }, groggy: 70 }] }]);
add("archer", [{ id: "ar_final", name: "천궁 강림", grade: "신화", kind: "ultimate", cd: 30, cost: { mp: 38 }, aim: "point", range: 400, anim: "shoot",
  desc: "지정한 지역에 별빛 화살을 14회 쏟아붓는다. 12초간 공격 속도 60%, 공격력 35%가 상승해 보스전과 다수전에 모두 강하다.",
  limit: "넓은 범위에 지속 피해를 주며 최대 16명을 공격한다.",
  fx: { area: "arcane/star-fall", tick: "projectiles/arrow", self: "arcane/spell-charge" },
  steps: [{ do: "buff", target: "self", id: "heaven_bow", dur: 12, mods: { aspd: 0.6, dmg: 0.35 } }, { do: "area", radius: 150, pow: 1.65, ticks: 14, interval: 0.22, telegraph: 0.35, max: 16 }] }]);
add("rogue", [{ id: "ro_final", name: "섀도우 처형", grade: "신화", kind: "ultimate", cd: 36, cost: { mp: 25 }, aim: "dir", anim: "stab", moveSkill: true,
  desc: "표적의 뒤로 순간 이동해 8연속 급소 공격을 가한다. 처형 후 8초간 공격력과 공격 속도가 상승한다.",
  limit: "단일 대상 처치와 보스의 약점 공략에 특화된다.",
  fx: { self: "arcane/blink-out", swing: "melee/dagger-flurry", hit: "impacts/crit-hit", palette: ["#100818", "#301848", "#6030a0", "#a070e0", "#e0d0ff", "#ffffff"] },
  steps: [{ do: "custom", fn: "shadowstep", range: 260, pow: 4.2 }, { do: "melee", range: 54, arc: 100, pow: 1.8, hits: 8, gap: 0.07, max: 1, critBonus: 0.65 }, { do: "buff", target: "self", id: "execution_flow", dur: 8, mods: { dmg: 0.25, aspd: 0.2 } }] }]);
add("mage", [{ id: "ma_final", name: "아포칼립스", grade: "신화", kind: "ultimate", cd: 42, cost: { mp: 52 }, aim: "point", range: 400, anim: "cast", cast: 0.65,
  desc: "하늘을 찢는 다섯 차례의 종말의 불기둥을 지정한 지역에 쏟아붓고, 불타는 적에게 추가 피해를 준다. 시전 후 8초간 공격력이 25% 상승한다.",
  limit: "넓은 범위에 5회 타격하며 최대 16명을 공격한다.",
  fx: { area: "fire/meteor", pre: "arcane/magic-circle-cast" },
  steps: [{ do: "area", radius: 150, pow: 4.3, ticks: 5, interval: 0.32, telegraph: 0.65, max: 16, status: { type: "burn", dur: 5, pow: 0.55 } }, { do: "buff", target: "self", id: "apocalypse_aftershock", dur: 8, mods: { dmg: 0.25 } }] }]);
add("priest", [{ id: "pr_final", name: "신의 심판", grade: "신화", kind: "ultimate", cd: 42, cost: { holy: 42 }, aim: "point", range: 320, anim: "cast", cast: 0.4,
  desc: "파티 전체를 크게 회복하고 성스러운 보호막을 씌운 뒤, 지정한 곳에 네 차례 심판의 빛을 내린다. 빛에 닿은 아군도 회복한다.",
  limit: "파티 회복·보호와 광역 공격을 한 번에 수행하는 성직자 최종기.",
  fx: { area: "holy/holy-pillar", self: "holy/heal-aoe" },
  steps: [{ do: "heal", target: "party", radius: 260, pctMax: 0.55 }, { do: "shield", target: "party", radius: 250, pow: 3.2, dur: 8 }, { do: "area", radius: 135, pow: 3.8, ticks: 4, interval: 0.32, telegraph: 0.4, max: 14, healAllies: 1.0 }] }]);
add("smith", [{ id: "sm_final", name: "천공의 망치", grade: "신화", kind: "ultimate", cd: 40, cost: { parts: 3 }, aim: "point", range: 280, anim: "smash",
  desc: "하늘에서 거대한 망치를 떨어뜨려 적진을 붕괴시키고, 주변 파티원에게 강력한 보호막을 부여한다.",
  limit: "부품 3개를 소모하는 대규모 파티 보호·제압 기술.",
  fx: { area: "melee/hammer-smash", self: "holy/divine-shield" },
  steps: [{ do: "shield", target: "party", radius: 260, pow: 4.0, dur: 9 }, { do: "area", radius: 150, pow: 8.2, telegraph: 0.55, max: 16, cc: { type: "stun", dur: 1.8 }, groggy: 70 }] }]);
export const SKILLS = Object.fromEntries(S.map((s) => [s.id, s]));
export const SKILL_LIST = S;

// 직업별 스킬 해금 단계: 일반 = 처음부터, 신화 = 마지막 단계, 나머지(희귀→영웅→전설 순)는
//  둘째 단계부터 마지막 바로 전 단계까지 고르게 나눔 → 단계가 오를 때마다 새 스킬이 열림
const GRADE_ORDER = ["일반", "희귀", "영웅", "전설", "신화"];
const stageMaps = new Map();
export function unlockStage(skill, stagesInClass) {
  if (skill.cls === "common" || skill.grade === "일반" || stagesInClass <= 1) return 0;
  if (skill.grade === "신화") return stagesInClass - 1;
  const key = skill.cls + "|" + stagesInClass;
  let m = stageMaps.get(key);
  if (!m) {
    const list = S.filter((s) => s.cls === skill.cls && !s.weaponBasic && s.grade !== "일반" && s.grade !== "신화")
      .sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade));
    const span = Math.max(1, stagesInClass - 2);
    m = new Map(list.map((s, i) => [s.id, 1 + Math.floor((i * span) / list.length)]));
    stageMaps.set(key, m);
  }
  return m.get(skill.id) ?? 1;
}
/** 직업의 스킬 목록 */
export function skillsOf(cls) {
  return S.filter((s) => s.cls === cls && !s.weaponBasic);
}
/** 모험가 기본 공격: 든 무기에 따라 달라짐 (장검·맨손 → 찌르기) */
export const WEAPON_BASIC = { bow: "c_shot", staff: "c_bolt", club: "c_bash", mace: "c_smite", knuckle: "c_jab", dagger: "c_stab", hammer: "c_pound", sword: "c_thrust" };
export function adventurerBasic(weaponType) {
  return WEAPON_BASIC[weaponType] ?? "c_thrust";
}

/** 자동 사용 AI가 스킬의 실제 도달 범위를 계산한다. */
export function skillReach(skill) {
  if (!skill) return 150;
  const steps = Array.isArray(skill.steps) ? skill.steps : [];
  const maxRadius = steps.reduce((r, st) =>
    Math.max(r, Number(st.radius) || 0, st.do === "taunt" ? Number(st.radius) || 0 : 0), 0);

  if (skill.aim === "ally") return Number(skill.range) || 240;
  if (skill.aim === "point") return (Number(skill.range) || 200) + maxRadius;
  if (skill.aim === "self") return maxRadius || 150;

  let travel = 0, reach = 0;
  for (const st of steps) {
    if (st.do === "dash" || st.do === "blink") {
      travel += Number(st.dist) || 0;
      if (st.hit) reach = Math.max(reach, travel + 24);
    } else if (st.do === "melee") {
      reach = Math.max(reach, travel + (Number(st.range) || 0) + 10);
    } else if (st.do === "proj") {
      reach = Math.max(reach, Number(st.range) || 0);
    } else if (st.do === "line") {
      reach = Math.max(reach, Number(st.length) || 0);
    } else if (st.do === "custom") {
      reach = Math.max(reach, travel + (Number(st.range) || 0));
    } else if (st.do === "area" || st.do === "circle" || st.do === "zone" || st.do === "taunt") {
      reach = Math.max(reach, travel + (Number(st.radius) || 0));
    }
  }
  return Math.max(150, reach);
}