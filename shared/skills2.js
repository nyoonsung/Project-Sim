// 2차 전직 스킬 (2차 업데이트 기획서 6장): 17개 경로 × 9개 (9등급 레벨 170 → 1등급 레벨 218)
// 서버 판정 규칙은 server/game/skills.js 의 2차 전직 부분(strike 추가 옵션·p2 패시브·CUSTOM)에 있다.
//  스킬 추가 필드: path(경로) tier(등급 9~1) hpCost(최대 HP 비율 소모) cost.r2(2차 자원) elem(원소: fire/ice/bolt) motif(아이콘)
//  타격 옵션: lifesteal lowHp perDef mark vsMark markBurst vsDot burstDot backstab stealthHit spendR2 r2OnHit pullIn shred curse vsCurse vsAir healAround blinkAtk
//  패시브: 해금된 passive.p2 / passive.mods 는 스킬칸에 장착하지 않아도 자동 적용

// 2차 전직 스킬 등급 표기는 "2차"(색: 청록) + 성장 등급(tier 9~1)
const GRADE_BY_TIER = { 9: "2차", 8: "2차", 7: "2차", 6: "2차", 5: "2차", 4: "2차", 3: "2차", 2: "2차", 1: "2차" };
export const PATH_SKILLS = [];
function path(id, cls, list) {
  if (list.length !== 9) throw new Error(`${id}: 2차 전직 스킬은 9개여야 해요 (${list.length})`);
  list.forEach((s, i) => {
    const tier = 9 - i;
    PATH_SKILLS.push({ cls, path: id, tier, grade: GRADE_BY_TIER[tier], ...s });
  });
}
const PAS = (o) => ({ kind: "passive", aim: "self", steps: [], ...o });

// ─────────────── 다크나이트 / 암흑기사 ───────────────
const DK_PAL = ["#14040a", "#40081a", "#801030", "#d03050", "#ff90a0", "#ffffff"];
path("darkknight", "sword", [
  { id: "dk_darkslash", name: "어둠베기", kind: "basic", aspd: 0.8, aim: "dir", anim: "slash", hpCost: 0.006, motif: "shadow",
    desc: "생명력을 대가로 전방의 적 하나에게 어둠의 검기를 날린다. 적중 피해의 30%를 흡혈한다.", limit: "휘두를 때마다 최대 HP 0.6%를 태운다. 빗나가면 생명력만 잃는다.",
    fx: { swing: "melee/heavy-cleave", hit: "shadow/life-steal", palette: DK_PAL }, steps: [{ do: "melee", range: 70, arc: 70, pow: 1.25, max: 1, lifesteal: 0.3, gainOnHit: { ki: 6 } }] },
  PAS({ id: "dk_blackheart", name: "검은 심장", motif: "heart", desc: "현재 생명력이 낮을수록 직접 공격이 강해진다. (HP 0%에 가까울수록 최대 +60%)", limit: "생명력이 높을 때는 효과가 거의 없다.", passive: { p2: { lowHpDmg: 0.6 } } }),
  { id: "dk_bloodmoon", name: "혈월파", kind: "active", cd: 7, aim: "dir", anim: "slash", hpCost: 0.04, motif: "moon",
    desc: "생명력을 태워 넓은 어둠의 검기를 직선으로 방출해 경로의 적을 벤다. 준 피해의 22%를 흡혈한다.", limit: "최대 HP 4% 소모. 다수전 광역기.",
    fx: { line: "shadow/shadow-flames", hit: "shadow/life-steal", palette: DK_PAL }, steps: [{ do: "line", length: 300, width: 64, pow: 2.6, lifesteal: 0.22 }] },
  { id: "dk_nighthunt", name: "밤의 사냥", kind: "active", cd: 9, aim: "dir", anim: "dash", moveSkill: true, hpCost: 0.03, motif: "dash",
    desc: "지정 방향으로 적을 관통해 이동하며 경로의 적을 베고, 끝 지점의 적에게 검기를 집중한다. 적중 피해로 흡혈한다.", limit: "최대 HP 3% 소모. 무적은 없다.",
    fx: { self: "shadow/shadow-tendrils", hit: "impacts/crit-hit", palette: DK_PAL }, steps: [{ do: "dash", dist: 170, speed: 640, hit: { pow: 1.6, lifesteal: 0.2 } }, { do: "melee", range: 56, arc: 120, pow: 1.8, max: 2, lifesteal: 0.2 }] },
  PAS({ id: "dk_bloodmail", name: "잔혈의 갑주", motif: "shield", desc: "검기 흡혈이 일어나면 채우지 못한 생명력 손실의 25%를 3초간 검은 보호막으로 바꾼다. (최대 HP 20% 상한, 1.2초마다)", limit: "공격을 이어야 보호가 유지된다.", passive: { p2: { drainShield: 0.25 } } }),
  { id: "dk_abyssbrand", name: "심연의 낙인", kind: "active", cd: 10, aim: "dir", anim: "thrust", hpCost: 0.03, motif: "target",
    desc: "적 하나에게 낙인을 새기고 암흑 검격을 가한다. 낙인된 적을 어둠의 검기로 다시 공격하면 낙인이 폭발해 추가 피해를 주고, 폭발도 흡혈한다.", limit: "최대 HP 3% 소모. 낙인은 8초.",
    fx: { swing: "melee/thrust", hit: "shadow/hex-sigil", palette: DK_PAL }, steps: [{ do: "melee", range: 72, arc: 40, pow: 2.2, max: 1, lifesteal: 0.2, mark: { n: 3, max: 3, dur: 8 } }] },
  { id: "dk_duskveil", name: "황혼의 장막", kind: "active", cd: 16, aim: "self", anim: "guard", hpCost: 0.05, motif: "shield",
    desc: "생명력을 태워 5초간 어둠의 장막을 두른다. 장막이 유지되는 동안 받은 첫 공격의 충격을 60% 완화하고, 검기 흡혈량이 늘어난다.", limit: "최대 HP 5% 소모. 공격을 멈추면 생명력 위험은 남는다.",
    fx: { self: "shadow/eclipse", palette: DK_PAL }, steps: [{ do: "custom", fn: "veil", dur: 5, cut: 0.6 }, { do: "buff", target: "self", id: "dusk_veil_drain", dur: 5, mods: { dmg: 0.1 } }] },
  { id: "dk_doomblade", name: "종말의 검기", kind: "active", cd: 14, aim: "dir", anim: "slash", cast: 0.5, fragile: true, hpCost: 0.08, motif: "arc",
    desc: "생명력을 더 바쳐 검기를 모은 뒤 전방으로 방출해 경로의 적에게 큰 피해를 준다. 현재 생명력이 낮을수록 위력이 커지고(최대 +100%) 적중 피해의 25%를 흡혈한다.", limit: "최대 HP 8% 소모, 0.5초 충전 중 피격되면 끊길 수 있다.",
    fx: { line: "shadow/dark-explosion", hit: "impacts/crit-hit", palette: DK_PAL }, steps: [{ do: "line", length: 360, width: 72, pow: 6.2, lowHp: 1.0, lifesteal: 0.25, markBurst: { pow: 1.2, min: 1 } }] },
  { id: "dk_eclipse", name: "피의 월식", kind: "ultimate", cd: 38, aim: "self", anim: "spin", hpCost: 0.06, motif: "moon",
    desc: "자신을 중심으로 월식의 영역을 펼쳐 6초 동안 주변 적에게 검기를 연속 방출한다. 각 검기는 생명력을 태우고 적중 피해를 흡혈하며, 생명력이 낮을수록 사나워진다.", limit: "흡혈은 소모량을 보장하지 않는다. 적이 없으면 생명력만 잃는다.",
    fx: { self: "shadow/eclipse", area: "shadow/shadow-flames", hit: "shadow/life-steal", palette: DK_PAL }, steps: [{ do: "custom", fn: "eclipse", radius: 170, ticks: 12, interval: 0.5, pow: 1.9, hpTick: 0.008, lifesteal: 0.18, lowHp: 0.8 }] },
]);

// ─────────────── 소드마스터 / 검성 ───────────────
const SG_PAL = ["#0a1a30", "#1a3a70", "#3a70c0", "#80b8ff", "#e0f0ff", "#ffffff"];
path("swordmaster", "sword", [
  { id: "sg_ilseom", name: "일섬", kind: "active", cd: 2.2, aim: "dir", anim: "dash", motif: "dash",
    desc: "가장 가까운 지정 대상에게 돌진해 안정적인 검격을 가한다. 적중하면 검식 순서(1형)를 시작한다.", limit: "짧은 재사용 대기로 반복해 쓸 수 있다.",
    fx: { self: "melee/thrust", hit: "impacts/hit-spark", palette: SG_PAL }, steps: [{ do: "dash", dist: 110, speed: 640, stopOnHit: true, hit: { pow: 1.9 } }, { do: "melee", range: 56, arc: 60, pow: 1.3, max: 1, gainOnHit: { ki: 10 } }] },
  PAS({ id: "sg_orthodox", name: "정통 검식", motif: "crest", desc: "일섬 → 회전연참 → 쇄도검을 순서대로 적중시키면 검식이 진행되고, 단계마다 6초간 주는 피해 +8% (최대 3중첩).", limit: "같은 형식을 반복하거나 순서가 깨지면 흐름이 끊긴다.", passive: { p2: { swordSeq: 0.08 } } }),
  { id: "sg_whirl", name: "회전연참", kind: "active", cd: 5, aim: "self", anim: "spin", cost: { ki: 15 }, motif: "arc",
    desc: "주위를 넓게 두 번 베어 가까운 적에게 피해를 준다. 검식의 2형.", limit: "사거리 안에 적이 모였을 때 효과적이다.",
    fx: { swing: "melee/spin-slash", hit: "impacts/hit-spark", palette: SG_PAL }, steps: [{ do: "circle", radius: 92, pow: 1.7 }, { do: "custom", fn: "delayCircle", delay: 0.22, radius: 92, pow: 1.3 }] },
  PAS({ id: "sg_parryflow", name: "검격 받아치기", motif: "shield", desc: "공격이 닿기 0.6초 안에(또는 일섬·검보로 돌진하는 동안) 소드마스터 스킬을 썼다면 그 근접·범위 공격을 흘려 피해를 60% 줄이고 최대 HP 6%와 내력 15를 회복한다. (3초마다)", limit: "너무 빠르거나 늦으면 발동하지 않는다. 막기 성공 시에도 회복한다.", passive: { p2: { parryHeal: 0.06 } } }),
  { id: "sg_rush", name: "쇄도검", kind: "active", cd: 6, aim: "dir", anim: "thrust", cost: { ki: 18 }, motif: "ray",
    desc: "지정한 적 하나를 향해 다섯 번 집중 찌르기를 한다. 일섬과 회전연참 다음에 적중시키면 세 형식의 검식이 완성된다.", limit: "좁은 공격선. 표적과 위치 선정이 중요하다.",
    fx: { swing: "melee/thrust", hit: "impacts/crit-hit", palette: SG_PAL }, steps: [{ do: "melee", range: 74, arc: 28, pow: 0.75, hits: 5, gap: 0.08, max: 1, pen: 0.15 }] },
  { id: "sg_step", name: "검보", kind: "active", cd: 7, aim: "dir", anim: "dash", moveSkill: true, motif: "wind",
    desc: "지정 방향으로 짧게 이동하며 경로의 가장 가까운 적을 벤다. 예고된 공격 밖으로 빠져 다음 형식을 준비한다.", limit: "방향이나 타이밍이 나쁘면 피격될 수 있다.",
    fx: { self: "melee/sword-slash", hit: "impacts/hit-spark", palette: SG_PAL }, steps: [{ do: "dash", dist: 120, speed: 620, hit: { pow: 1.8 } }] },
  PAS({ id: "sg_complete", name: "검식 완성", motif: "crest", desc: "세 형식을 순서대로 적중시켜 검식이 완성되면 6초간 주는 피해 +25%, 치명타 확률 +10%p.", limit: "빗나가거나 같은 형식을 반복하면 초기화된다.", passive: { p2: { seqFinish: 0.25 } } }),
  { id: "sg_aura", name: "오러 파참", kind: "active", cd: 4, aim: "dir", anim: "slash", cost: { ki: 12 }, motif: "wave",
    desc: "지정한 선을 따라 검기를 날려 경로의 적에게 피해를 준다. 검식 사이에 멀리 있거나 일렬로 선 적을 압박하는 반복기.", limit: "검식 완성을 대신하지 않는다.",
    fx: { line: "arcane/arcane-missiles", hit: "impacts/hit-spark", palette: SG_PAL }, steps: [{ do: "line", length: 340, width: 40, pow: 2.3 }] },
  PAS({ id: "sg_mugeuk", name: "검성 비전·무극발도", motif: "arc", desc: "검식이 완성되면 최종 표적을 가르는 방어 관통 발도(공격력 900%, 방어 관통 50%)를 자동으로 발동하고, 같은 선을 따라 검기 파동(400%)을 보내 뒤의 적도 공격한다.", limit: "순서를 완성해야 하며 한 기술만 반복해서는 발동하지 않는다. (내부 재사용 4초)", passive: { p2: { seqFinisher: { pow: 9, pen: 0.5, wave: 4 } } } }),
]);

// ─────────────── 가디언 몽크 / 금강무사 ───────────────
const VJ_PAL = ["#201406", "#5a3a10", "#a07020", "#f0c050", "#fff0b0", "#ffffff"];
path("vajra", "fist", [
  { id: "vj_vajrafist", name: "금강권", kind: "basic", aspd: 0.85, aim: "dir", anim: "punch", motif: "impact",
    desc: "전방의 적 하나를 주먹으로 두 번 연속 타격하는 기본 공격. 적중 시 기세(내력)를 쌓으며 방어력이 높을수록 위력이 오른다.", limit: "사거리가 짧다.",
    fx: { hit: "impacts/blunt-hit", palette: VJ_PAL }, steps: [{ do: "melee", range: 42, arc: 60, pow: 0.5, hits: 2, gap: 0.12, max: 1, perDef: 0.35, gainOnHit: { ki: 5 }, threat: 2 }] },
  PAS({ id: "vj_ironbone", name: "철골단련", motif: "shield", desc: "방어력의 20%를 공격력으로 환산한다. 방어 장비를 선택해도 공격력이 함께 성장한다.", limit: "", passive: { mods: { defToAtk: 0.2 } } }),
  { id: "vj_quake", name: "지진타", kind: "active", cd: 6, aim: "self", anim: "smash", motif: "impact",
    desc: "땅을 내리쳐 주변 적에게 피해를 주고 가까운 적을 흔들어 행동을 끊는다. 적중한 적이 많을수록 기세를 더 얻는다.", limit: "보스는 그로기만 누적.",
    fx: { area: "nature/quake", hit: "impacts/ground-slam", palette: VJ_PAL }, steps: [{ do: "circle", radius: 110, pow: 1.6, perDef: 0.3, interrupt: true, groggy: 14, gainPerHit: { ki: 6 }, gainCap: { ki: 30 }, threat: 3 }] },
  { id: "vj_guardtaunt", name: "호신도발", kind: "active", cd: 18, aim: "self", anim: "guard", motif: "crest",
    desc: "주변 적의 시선을 끌고, 8초간 아군에게 향하는 피해의 30%를 대신 받는다(대신 받는 피해 25% 감소).", limit: "솔로에서는 적의 공격을 자신에게 고정한다.",
    fx: { self: "holy/divine-shield", palette: VJ_PAL }, steps: [{ do: "taunt", radius: 240, dur: 4 }, { do: "custom", fn: "guardShare", dur: 8, pct: 0.3, dr: 0.25 }, { do: "buff", target: "self", id: "vj_guard", dur: 8, mods: { dr: 0.12 } }] },
  { id: "vj_chainfist", name: "연환철권", kind: "active", cd: 5, aim: "dir", anim: "punch", motif: "twin",
    desc: "전방의 적을 연속 주먹으로 여섯 번 몰아친다. 각 타격은 방어력의 공격력 전환을 받고 연속 적중으로 기세를 보충한다.", limit: "전방 좁은 범위.",
    fx: { swing: "melee/claw-swipe", hit: "impacts/blunt-hit", palette: VJ_PAL }, steps: [{ do: "melee", range: 48, arc: 70, pow: 0.42, hits: 6, gap: 0.09, max: 2, perDef: 0.35, gainOnHit: { ki: 3 } }] },
  { id: "vj_ironstep", name: "철산보", kind: "active", cd: 9, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "지정 방향으로 짧게 돌진해 첫 적에게 어깨치기 피해를 주고 착지 지점 주변 적의 시선을 끈다.", limit: "교전 시작·회피용. 이후 위치 선정이 필요하다.",
    fx: { self: "spawn/poof", hit: "impacts/heavy-landing", palette: VJ_PAL }, steps: [{ do: "dash", dist: 130, speed: 600, stopOnHit: true, hit: { pow: 1.8, perDef: 0.3, knock: 40, groggy: 16 } }, { do: "taunt", radius: 140, dur: 3 }] },
  PAS({ id: "vj_breath", name: "금강호흡", motif: "heart", desc: "주먹 기술로 적을 맞히면 호흡을 5 회복한다. 호흡이 25 이상이면 직접 피격 때 25를 소모해 받는 충격을 35% 완화한다. (1.2초마다)", limit: "적을 계속 공격해야 활용할 수 있다.", passive: { p2: { breath: 0.35 } } }),
  { id: "vj_crush", name: "금강쇄", kind: "active", cd: 10, aim: "dir", anim: "smash", cost: { ki: 20 }, motif: "impact",
    desc: "쌓은 기세(내력)를 최대 60 더 소모해 전방의 적 하나에게 묵직한 내려치기를 가한다. 방어력이 높을수록, 소모한 기세가 많을수록 피해가 커진다.", limit: "기세가 부족하면 위력이 제한된다.",
    fx: { hit: "impacts/ground-slam", hitScale: 0.8, palette: VJ_PAL }, steps: [{ do: "melee", range: 56, arc: 50, pow: 3.2, max: 1, perDef: 0.5, spendKi: { max: 60, per: 0.04 }, groggy: 30 }] },
  { id: "vj_vajraform", name: "금강불괴·호법진", kind: "ultimate", cd: 40, aim: "self", anim: "guard", motif: "crest",
    desc: "4초간 금강의 자세(받는 피해 -40%, 아군 피해 40% 대신 받음)를 취하고, 자세를 끝내며 축적한 충격을 주변 적에게 폭발시킨다. 대신 받은 피해가 클수록 반격이 강해진다.", limit: "자세 중 이동이 느려진다. 자신도 위험하므로 호흡과 생명력을 살핀다.",
    fx: { self: "holy/divine-shield", area: "impacts/ground-slam", palette: VJ_PAL }, steps: [{ do: "custom", fn: "vajraForm", dur: 4, dr: 0.4, share: 0.4, radius: 160, pow: 6, perStore: 10 }] },
]);

// ─────────────── 스트라이커 / 섬광권사 ───────────────
const ST_PAL = ["#201806", "#605010", "#c0a020", "#ffe060", "#fff8c0", "#ffffff"];
path("striker", "fist", [
  { id: "st_jabs", name: "연속 정권", kind: "basic", aspd: 0.8, aim: "dir", anim: "punch", motif: "impact",
    desc: "전방의 적 하나에게 빠르게 세 번 정권을 날린다. 마지막 타격은 짧은 경직을 준다.", limit: "사거리가 짧다.",
    fx: { hit: "impacts/hit-spark", palette: ST_PAL }, steps: [{ do: "melee", range: 42, arc: 50, pow: 0.36, hits: 3, gap: 0.09, max: 1, gainOnHit: { ki: 4 } }] },
  PAS({ id: "st_advance", name: "전진 보법", motif: "wind", desc: "근접 타격 적중 후 2.5초간 이동 속도 +25%. 피격되면 효과가 끊긴다.", limit: "", passive: { p2: { stepRush: 0.25 } } }),
  { id: "st_flashrush", name: "섬광쇄도", kind: "active", cd: 7, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "입력 방향으로 빠르게 돌진하며 경로의 적을 연속 타격하고 끝 지점 주변의 적을 끌어모은다.", limit: "경로에 적이 없으면 타격 연계는 없다.",
    fx: { self: "lightning/spark-arc", hit: "impacts/hit-spark", palette: ST_PAL }, steps: [{ do: "dash", dist: 170, speed: 680, hit: { pow: 1.5 } }, { do: "custom", fn: "gather", radius: 120, pull: 60, pow: 0.9 }] },
  { id: "st_pierce", name: "관통섬광권", kind: "active", cd: 8, aim: "dir", anim: "punch", cast: 0.25, cost: { ki: 15 }, motif: "ray",
    desc: "전방으로 방어 관통 정권을 내질러 일직선상의 적에게 피해를 주고 보스의 그로기 게이지를 크게 압박한다.", limit: "방향 전환이 제한된다.",
    fx: { line: "lightning/zap-hit", hit: "impacts/crit-hit", palette: ST_PAL }, steps: [{ do: "line", length: 220, width: 46, pow: 3.0, pen: 0.4, groggy: 40 }] },
  PAS({ id: "st_counterbreath", name: "반격 호흡", motif: "heart", desc: "이동기를 쓴 뒤 2.5초 안에 근접 기술을 적중시키면 최대 HP 5%를 회복한다.", limit: "회피 후 공격을 맞혀야 한다.", passive: { p2: { dodgeHeal: 0.05 } } }),
  { id: "st_risekick", name: "상승 연각", kind: "active", cd: 8, aim: "dir", anim: "kick", cost: { ki: 12 }, motif: "kick",
    desc: "눈앞의 적을 올려차 2초간 공중으로 띄운다. 보스는 뜨지 않는 대신 그로기를 크게 압박한다.", limit: "빗나가면 빈틈이 생긴다.",
    fx: { swing: "melee/uppercut", hit: "impacts/crit-hit", palette: ST_PAL }, steps: [{ do: "melee", range: 46, arc: 70, pow: 2.0, max: 2, cc: { type: "down", dur: 1.6 }, air: 2, groggy: 35 }] },
  { id: "st_aircombo", name: "공중연계타", kind: "active", cd: 6, aim: "dir", anim: "combo", motif: "twin",
    desc: "공중의 적을 쫓아 네 번 연속 타격한 뒤 지면으로 내려찍어 주변 적도 휩쓴다. 공중의 적이 없으면 짧은 전진 타격으로 바뀐다.", limit: "공중 대상에게 +80% 피해.",
    fx: { swing: "melee/double-slash", hit: "impacts/heavy-landing", palette: ST_PAL }, steps: [{ do: "dash", dist: 50, speed: 500 }, { do: "melee", range: 50, arc: 80, pow: 0.55, hits: 4, gap: 0.08, max: 2, vsAir: 0.8 }, { do: "circle", radius: 80, pow: 1.3, vsAir: 0.8 }] },
  PAS({ id: "st_unbroken", name: "끊김 없는 연타", motif: "twin", desc: "서로 다른 공격 기술을 연속 적중시키면 다음 기술이 적중한 적에게 추가 타격(공격력 80%)을 낸다. (0.35초마다)", limit: "같은 기술만 반복하거나 빗나가면 끊긴다.", passive: { p2: { chainHit: 0.8 } } }),
  { id: "st_infinite", name: "섬광무한연격", kind: "ultimate", cd: 34, aim: "dir", anim: "dash", motif: "lightning",
    desc: "전방으로 돌진해 적을 붙잡고 섬광 정권 열두 번 연타 후 공중에서 마무리한다. 보스에게는 방어 관통 타격과 그로기를 준다.", limit: "시작 돌진이 빗나가면 후속 연격 없이 끝난다.",
    fx: { self: "lightning/spark-arc", hit: "lightning/zap-hit", palette: ST_PAL }, steps: [{ do: "custom", fn: "grabRush", dist: 220, hits: 12, gap: 0.07, pow: 0.75, finish: 6.5, pen: 0.35, radius: 90, groggy: 60 }] },
]);

// ─────────────── 아크메이지 / 대마법사 ───────────────
const AM_FIRE = ["#200400", "#801800", "#e04010", "#ff9030", "#ffe090", "#ffffff"];
path("archmage", "mage", [
  { id: "am_firelance", name: "화염 창", kind: "basic", aspd: 0.85, aim: "dir", anim: "cast", elem: "fire", motif: "flame",
    desc: "정면의 적 하나에게 화염 창을 발사한다. 불붙은 적에게 +25% 피해.", limit: "반복 견제기.",
    fx: { proj: "fire/fireball", scale: 0.5, hit: "explosions/small-explosion" }, steps: [{ do: "proj", speed: 560, range: 300, pow: 1.5, radius: 7, vsDot: 0.25, status: { type: "burn", dur: 3, pow: 0.25 } }] },
  { id: "am_emberring", name: "잿불 고리", kind: "active", cd: 6, cost: { mp: 14 }, aim: "self", anim: "cast", elem: "fire", motif: "flame",
    desc: "자신 주위에 화염 고리를 펼쳐 가까운 적을 태우고 밀어낸다.", limit: "포위되기 전에 공간을 연다.",
    fx: { area: "fire/fire-ring", hit: "impacts/hit-spark" }, steps: [{ do: "circle", radius: 120, pow: 2.0, knock: 50, status: { type: "burn", dur: 4, pow: 0.35 } }] },
  PAS({ id: "am_cycle", name: "원소 순환", motif: "orbit", desc: "화염·빙결·번개 기술을 번갈아 적중시키면 최대 MP 5%를 회복하고 4초간 최대 HP 8%의 비전 보호막을 얻는다. (2초마다)", limit: "같은 원소만 반복하면 발동하지 않는다.", passive: { p2: { elemCycle: 0.08 } } }),
  { id: "am_boltlance", name: "뇌격 창", kind: "active", cd: 5, cost: { mp: 12 }, aim: "dir", anim: "cast", elem: "bolt", motif: "lightning",
    desc: "조준한 적 하나에게 번개를 집중해 피해를 주고 감전시키며, 이미 감전된 적은 기절시킨다. 보스는 짧게 경직(그로기).", limit: "제어 면역 중에도 피해는 유지된다.",
    fx: { proj: "lightning/ball-lightning", hit: "lightning/zap-hit" }, steps: [{ do: "proj", speed: 640, range: 320, pow: 2.8, radius: 8, status: { type: "shock", dur: 3 }, ccIfShock: { type: "stun", dur: 1.0 }, groggy: 20 }] },
  { id: "am_froststorm", name: "서리 폭풍", kind: "active", cd: 9, cost: { mp: 20 }, aim: "point", range: 320, anim: "cast", elem: "ice", motif: "ice",
    desc: "지정한 지면에 빙결 폭풍을 일으켜 3회 피해를 주고 얼린다. 보스는 얼지 않는 대신 둔화된다.", limit: "",
    fx: { area: "ice/blizzard-vortex" }, steps: [{ do: "area", radius: 110, pow: 1.3, ticks: 3, interval: 0.35, freezeChance: 0.35, status: { type: "slow", dur: 2.5, v: 0.4 } }] },
  { id: "am_leap", name: "원소 도약", kind: "active", cd: 8, aim: "dir", anim: "cast", moveSkill: true, elem: "bolt", motif: "dash",
    desc: "지정 방향으로 짧게 순간이동해 공격선을 벗어나고 도착 지점의 적에게 가벼운 번개 피해를 준다.", limit: "이동 후의 연속 공격까지 막아 주지는 않는다.",
    fx: { self: "arcane/blink-out", end: "arcane/blink-in", area: "lightning/thunderclap" }, steps: [{ do: "blink", dist: 170 }, { do: "circle", radius: 70, pow: 1.2 }] },
  { id: "am_starfall", name: "낙성 영창", kind: "active", cd: 14, cost: { mp: 32 }, aim: "point", range: 360, anim: "cast", cast: 1.0, fragile: true, elem: "fire", motif: "meteor",
    desc: "지정 지점에 운석을 불러 넓은 범위에 강한 화염 피해를 준다. 영창 중에는 이동과 공격이 제한된다.", limit: "1초 영창. 피격 시 끊길 수 있다.",
    fx: { area: "fire/meteor", pre: "arcane/magic-circle-cast" }, steps: [{ do: "area", radius: 150, pow: 7.2, telegraph: 0.35, status: { type: "burn", dur: 5, pow: 0.45 } }] },
  PAS({ id: "am_precise", name: "정밀 영창", motif: "target", desc: "영창 스킬을 마치면 다음 직접 공격이 표적에게 원소 표식을 남긴다. 표식된 적을 다른 원소 기술로 공격하면 추가 원소 타격(공격력 150%)이 발생한다.", limit: "", passive: { p2: { precast: 1.5 } } }),
  { id: "am_trinity", name: "삼원 대단원", kind: "ultimate", cd: 36, cost: { mp: 50 }, aim: "point", range: 360, anim: "cast", cast: 1.4, fragile: true, elem: "ice", motif: "orbit",
    desc: "화염·빙결·번개를 한 지점에 모으는 긴 영창을 마치면 원소 폭발을 세 번 일으키고 중심 표적에 타격을 집중한다.", limit: "1.4초 영창, 피격되면 끊긴다.",
    fx: { area: "arcane/mana-burst", pre: "arcane/magic-circle-cast", hit: "lightning/zap-hit" }, steps: [{ do: "area", radius: 170, pow: 4.6, ticks: 3, interval: 0.3, telegraph: 0.3, freezeChance: 0.2, status: { type: "burn", dur: 4, pow: 0.4 } }, { do: "custom", fn: "focusCenter", radius: 60, pow: 6 }] },
]);

// ─────────────── 워록 / 흑마법사 ───────────────
const WL_PAL = ["#0a0414", "#2a0c40", "#5a20a0", "#a060e0", "#e0b8ff", "#ffffff"];
path("warlock", "mage", [
  { id: "wl_cursebolt", name: "저주탄", kind: "basic", aspd: 0.85, aim: "dir", anim: "cast", motif: "shadow",
    desc: "선택한 적에게 암흑 투사체를 날려 피해를 주고 8초간 저주를 건다.", limit: "",
    fx: { proj: "shadow/void-orb", scale: 0.45, hit: "shadow/curse" }, steps: [{ do: "proj", speed: 480, range: 300, pow: 1.45, radius: 7, curse: 8 }] },
  { id: "wl_plague", name: "역병의 고리", kind: "active", cd: 7, cost: { mp: 16 }, aim: "self", anim: "cast", motif: "poison",
    desc: "주변 적에게 역병을 퍼뜨려 암흑 피해와 지속 피해를 준다. 역병에 걸린 적이 쓰러지면 남은 역병이 가까운 적에게 옮겨간다.", limit: "",
    fx: { area: "nature/poison-cloud", palette: WL_PAL }, steps: [{ do: "circle", radius: 130, pow: 1.4, curse: 8, status: { type: "poison", dur: 8, pow: 0.55 }, plague: true }] },
  { id: "wl_drainpact", name: "흡혈의 서약", kind: "active", cd: 8, cost: { mp: 16 }, aim: "dir", anim: "channel", motif: "heart",
    desc: "선택한 적을 생명력의 실로 묶어 2초 동안 암흑 피해를 주고, 가한 피해의 35%를 생명력으로 회복한다.", limit: "대상과의 거리가 300을 넘으면 흡수가 끊긴다.",
    fx: { hit: "shadow/soul-drain", palette: WL_PAL }, steps: [{ do: "custom", fn: "drainTether", range: 300, ticks: 5, interval: 0.4, pow: 0.9, lifesteal: 0.35 }] },
  PAS({ id: "wl_deathmark", name: "죽음의 낙인", motif: "target", desc: "저주받은 적은 워록과 소환수에게 받는 피해가 +15% 늘어난다. 낙인된 적을 직접 공격하면 저주가 갱신된다.", limit: "", passive: { p2: { curseAmp: 0.15 } } }),
  { id: "wl_hellhound", name: "지옥사냥개 소환", kind: "active", cd: 20, cost: { mp: 26 }, aim: "self", anim: "cast", motif: "dragon",
    desc: "악마 사냥개 둘을 불러 18초간 싸우게 한다. 사냥개는 저주받은 적을 우선 공격한다.", limit: "다시 쓰면 기존 사냥개를 대체한다.",
    fx: { self: "spawn/summon-rise", palette: WL_PAL }, steps: [{ do: "custom", fn: "pets", skin: "hound", n: 2, dur: 18, pow: 1.1, interval: 0.8, speed: 160, preferCurse: true }] },
  { id: "wl_corpseburst", name: "망자의 폭발", kind: "active", cd: 9, cost: { mp: 22 }, aim: "point", range: 320, anim: "cast", motif: "impact",
    desc: "지정 지점의 저주·역병 대상에게 암흑 폭발 피해를 준다. 지속 피해는 제거하지 않는다.", limit: "저주·역병 대상에게 +60% 피해.",
    fx: { area: "shadow/dark-explosion", palette: WL_PAL }, steps: [{ do: "area", radius: 130, pow: 2.8, telegraph: 0.2, vsCurse: 0.6, vsDot: 0.3 }] },
  PAS({ id: "wl_duskveil", name: "황혼의 장막", motif: "shield", desc: "흡혈로 생명력을 회복하면 3초간 그림자 장막이 감싸 받는 피해 -15%, 이동 속도 +20%. (4초마다)", limit: "", passive: { p2: { drainVeil: 0.15 } } }),
  { id: "wl_voidrend", name: "공허 파쇄", kind: "active", cd: 12, cost: { mp: 30 }, aim: "dir", anim: "cast", motif: "vortex",
    desc: "저주 대상의 방어를 공허 마력으로 찢어 큰 단일 피해를 준다. 역병이 있으면 남은 지속 피해를 즉시 터뜨린다.", limit: "저주 대상에게 +40%, 방어 관통 30%.",
    fx: { proj: "shadow/black-hole", scale: 0.4, hit: "shadow/dark-explosion" }, steps: [{ do: "proj", speed: 520, range: 320, pow: 5.0, radius: 9, pen: 0.3, vsCurse: 0.4, burstDot: 1.0 }] },
  { id: "wl_abysslord", name: "심연 군주의 강림", kind: "ultimate", cd: 40, cost: { mp: 48 }, aim: "dir", anim: "cast", motif: "dragon",
    desc: "저주받은 적 하나를 심연의 표적으로 지정해 악마 군주와 망령을 12초 동안 불러낸다. 둘은 표적을 연속 공격하고 주변 저주 대상에게 망령 파동을 퍼뜨리며, 소환이 끝나면 표적의 저주를 다시 새긴다.", limit: "표적이 없으면 가장 가까운 적을 노린다.",
    fx: { self: "spawn/summon-rise", hit: "shadow/necro-skulls", palette: WL_PAL }, steps: [{ do: "custom", fn: "pets", skin: "demon", n: 1, dur: 12, pow: 3.0, interval: 0.7, speed: 120, focus: true, wave: 1.2 }, { do: "custom", fn: "pets", skin: "wraith", n: 1, dur: 12, pow: 1.6, interval: 0.6, speed: 170, focus: true }] },
]);

// ─────────────── 아케인 아처 / 마궁수 ───────────────
const AA_PAL = ["#0c0620", "#2a1860", "#6040c0", "#b090ff", "#f0e0ff", "#ffffff"];
path("arcanearcher", "archer", [
  { id: "aa_pierce", name: "마력 관통화살", kind: "basic", aspd: 0.75, aim: "dir", anim: "shoot", motif: "ray",
    desc: "마력을 실은 화살로 첫 적과 뒤의 적 하나를 관통한다. 적중한 적마다 MP를 1.5% 회복한다.", limit: "",
    fx: { proj: "arcane/magic-missile", hit: "arcane/mana-burst", palette: AA_PAL }, steps: [{ do: "proj", speed: 620, range: 320, pow: 1.15, radius: 6, pierce: 1, gainOnHit: { mpPct: 0.015 }, huntMark: true }] },
  { id: "aa_burst", name: "원소 폭렬촉", kind: "active", cd: 5, cost: { mp: 12 }, aim: "dir", anim: "shoot", motif: "meteor",
    desc: "화살에 원소를 응축해 명중 지점에서 폭발시키고 주변 적에게 피해를 준다.", limit: "",
    fx: { proj: "projectiles/plasma-shot", hit: "explosions/plasma-explosion", palette: AA_PAL }, steps: [{ do: "proj", speed: 560, range: 300, pow: 1.8, radius: 7, explode: { radius: 80, pow: 1.4 }, markMp: 0.03 }] },
  { id: "aa_meteorrain", name: "유성 화살비", kind: "active", cd: 10, cost: { mp: 22 }, aim: "point", range: 330, anim: "shoot", motif: "rain",
    desc: "지정 지점에 마력 화살을 여섯 번 퍼붓는다. 범위 안의 적이 적을수록 화살이 집중된다.", limit: "",
    fx: { area: "arcane/arcane-missiles", tick: "projectiles/magic-missile", palette: AA_PAL }, steps: [{ do: "area", radius: 120, pow: 0.9, ticks: 6, interval: 0.22, focusFew: 0.5 }] },
  PAS({ id: "aa_hunter", name: "비전 사냥꾼", motif: "target", desc: "마력 관통화살로 같은 적을 연속 적중시키면 사냥 표식이 쌓인다(최대 5). 표식 대상에게 원소 폭렬촉·혜성 추적사격을 맞히면 MP 3%를 회복한다.", limit: "다른 적을 맞히면 이전 표식이 사라진다.", passive: { p2: { arcHunt: true } } }),
  { id: "aa_comet", name: "혜성 추적사격", kind: "active", cd: 6, cost: { mp: 16 }, aim: "dir", anim: "shoot", motif: "ray",
    desc: "빠르고 강한 마력 화살을 발사한다. 사냥 표식 대상에게 적중하면 표식당 +12% 피해를 주고 뒤의 적까지 관통한다.", limit: "",
    fx: { proj: "arcane/arcane-orb", scale: 0.5, hit: "impacts/crit-hit", palette: AA_PAL }, steps: [{ do: "proj", speed: 820, range: 360, pow: 2.9, radius: 7, pierce: 1, vsMark: 0.12, markMp: 0.03 }] },
  { id: "aa_scatter", name: "원소 화살난무", kind: "active", cd: 8, cost: { mp: 18 }, aim: "dir", anim: "shoot", motif: "twin",
    desc: "전방 부채꼴로 원소 화살 아홉 발을 흩뿌린다. 사냥 표식 대상에게 +10% 피해.", limit: "",
    fx: { proj: "projectiles/magic-missile", hit: "arcane/mana-burst", palette: AA_PAL }, steps: [{ do: "proj", speed: 560, range: 260, pow: 0.75, count: 9, spread: 70, radius: 6, vsMark: 0.1 }] },
  { id: "aa_leap", name: "비전 도약", kind: "active", cd: 9, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "이동 방향으로 짧게 도약해 적의 공격을 피하고, 2초간 다음 마력 화살 피해 +30%.", limit: "상시 방어는 아니다.",
    fx: { self: "arcane/blink-out", palette: AA_PAL }, steps: [{ do: "dash", dist: 140, speed: 620, side: true }, { do: "buff", target: "self", id: "aa_focus", dur: 2, nextHit: { pow: 0.3 } }] },
  { id: "aa_skypierce", name: "천공 관통진", kind: "active", cd: 13, cost: { mp: 28 }, aim: "dir", anim: "shoot", cast: 0.4, motif: "lightning",
    desc: "조준한 적을 꿰뚫는 거대 마력 화살을 발사한다. 사냥 표식 대상에게 적중하면 표식을 소모해 충격파를 일으킨다.", limit: "표식이 없어도 직선 피해를 준다.",
    fx: { line: "arcane/arcane-beam", hit: "explosions/plasma-explosion", palette: AA_PAL }, steps: [{ do: "line", length: 400, width: 52, pow: 5.0, markBurst: { pow: 1.0, min: 1, radius: 100 } }] },
  { id: "aa_skygate", name: "마궁·천궁개문", kind: "ultimate", cd: 34, cost: { mp: 45 }, aim: "point", range: 360, anim: "channel", cast: 0.3, motif: "rain",
    desc: "지정 지점 상공에 비전의 문을 열어 열 번의 화살비를 쏟고 마지막에 원소 폭발을 일으킨다. 범위 안의 사냥 표식 대상을 폭발 중심으로 끌어모은다.", limit: "시전 중 이동할 수 없다.",
    fx: { area: "arcane/portal", tick: "projectiles/magic-missile", hit: "explosions/plasma-explosion", palette: AA_PAL }, steps: [{ do: "custom", fn: "gateRain", radius: 170, ticks: 10, interval: 0.2, pow: 1.3, final: 6.5 }] },
]);

// ─────────────── 윈드워커 / 질풍사수 ───────────────
const WW_PAL = ["#021812", "#0a4a3a", "#20a080", "#60e0c0", "#d0fff0", "#ffffff"];
path("windwalker", "archer", [
  { id: "ww_gale", name: "질풍 연사", kind: "basic", aspd: 0.7, aim: "dir", anim: "shoot", motif: "wind",
    desc: "전방의 적 하나를 향해 화살 세 발을 빠르게 연속 발사한다. 적중할 때마다 바람의 박자를 쌓는다.", limit: "",
    fx: { proj: "projectiles/arrow", hit: "impacts/hit-spark", palette: WW_PAL }, steps: [{ do: "proj", speed: 640, range: 300, pow: 0.45, count: 3, burst: 0.08, radius: 5 }] },
  PAS({ id: "ww_beat", name: "바람 칼날의 박자", motif: "wind", desc: "궁수 공격이 적중할 때마다 바람의 박자 8을 쌓고, 박자가 100이 되면 조준 대상에게 바람 칼날(공격력 300%)을 추가 발사한다. 4초 동안 적을 맞히지 못하면 박자가 사라진다.", limit: "", passive: { p2: { windBeat: 8 } } }),
  { id: "ww_pierce", name: "관통 화살비", kind: "active", cd: 7, cost: { mp: 16 }, aim: "dir", anim: "shoot", motif: "rain",
    desc: "전방으로 바람을 두른 화살 일곱 발을 퍼뜨려 경로의 적을 관통한다. 적중한 적마다 박자를 쌓는다.", limit: "",
    fx: { proj: "projectiles/arrow", hit: "nature/leaf-storm", palette: WW_PAL }, steps: [{ do: "proj", speed: 600, range: 300, pow: 0.9, count: 7, spread: 50, pierce: 2, radius: 6 }] },
  { id: "ww_leap", name: "깃바람 도약", kind: "active", cd: 8, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "조준 방향으로 공중 도약하며 이동 중 0.4초 무적, 착지 지점으로 화살 세 발을 발사한다.", limit: "",
    fx: { self: "nature/tornado", palette: WW_PAL }, steps: [{ do: "custom", fn: "iframe", dur: 0.4 }, { do: "dash", dist: 150, speed: 600 }, { do: "proj", speed: 640, range: 260, pow: 0.9, count: 3, spread: 24, radius: 6 }] },
  PAS({ id: "ww_spirit", name: "정령의 숨결", motif: "wind", desc: "바람 칼날이 적중하면 정령의 숨결이 돌아와 깃바람 도약의 재사용 대기가 2초 줄어든다.", limit: "", passive: { p2: { spiritBreath: 2 } } }),
  { id: "ww_hawk", name: "바람매 표식", kind: "active", cd: 12, cost: { mp: 12 }, aim: "dir", anim: "shoot", motif: "target",
    desc: "조준한 적에게 10초간 바람매 표식을 남긴다. 표식 대상에게 주는 피해 +20%, 바람 칼날이 표식 대상을 추적한다.", limit: "새 표식은 이전 표식을 대체한다.",
    fx: { proj: "critters/bird", scale: 0.4, hit: "status/cursed", palette: WW_PAL }, steps: [{ do: "proj", speed: 700, range: 360, pow: 1.2, radius: 8, hawk: 10 }] },
  { id: "ww_updraft", name: "상승기류 사격", kind: "active", cd: 10, cost: { mp: 22 }, aim: "point", range: 280, anim: "shoot", motif: "rain",
    desc: "위로 솟구쳐 공중에서 부채꼴 화살을 쏘고 착탄 지점에 바람 칼날 소용돌이(3회)를 일으킨다.", limit: "착지 위치가 적의 공격에 노출된다.",
    fx: { area: "nature/tornado", tick: "nature/leaf-storm", palette: WW_PAL }, steps: [{ do: "area", radius: 110, pow: 1.6, ticks: 3, interval: 0.3, telegraph: 0.15 }] },
  PAS({ id: "ww_galestep", name: "회풍의 발걸음", motif: "wind", desc: "깃바람 도약을 쓰면 바람의 박자 35를 얻는다.", limit: "숨결은 적중으로 회복되므로 회피만 반복해 도약을 이어갈 수 없다.", passive: { p2: { leapBeat: 35 } } }),
  { id: "ww_descent", name: "질풍 정령의 강림", kind: "ultimate", cd: 32, cost: { mp: 40 }, aim: "dir", anim: "channel", motif: "wind",
    desc: "바람 정령과 공명해 3초 동안 전방 조준선 위로 화살을 연사하고, 쌓인 박자를 바람 칼날 연쇄 발사로 전환한다.", limit: "발동 중 조준과 위치 선정이 중요하다.",
    fx: { proj: "projectiles/arrow", hit: "nature/leaf-storm", palette: WW_PAL }, steps: [{ do: "custom", fn: "volleyStream", shots: 20, gap: 0.15, pow: 0.85, beatBlades: true }] },
]);

// ─────────────── 센티넬 아처 ───────────────
const SN_PAL = ["#181408", "#4a4018", "#a09030", "#e8d880", "#fff8d0", "#ffffff"];
path("sentinel", "archer", [
  { id: "sn_quick", name: "속사 조준", kind: "basic", aspd: 0.75, aim: "dir", anim: "shoot", motif: "ray",
    desc: "조준 중인 적 하나에게 빠르게 볼트를 발사해 안정적인 피해를 준다.", limit: "",
    fx: { proj: "projectiles/bullet-tracer", hit: "impacts/bullet-impact", palette: SN_PAL }, steps: [{ do: "proj", speed: 760, range: 340, pow: 1.2, radius: 5 }] },
  PAS({ id: "sn_still", name: "정지 사격술", motif: "target", desc: "이동하지 않고 0.4초 이상 서 있으면 초당 조준 에너지 30이 쌓인다(최대 100). 에너지를 소모하는 사격은 방어를 더 관통한다.", limit: "움직이면 축적이 끊긴다.", passive: { p2: { stillAim: 30 } } }),
  { id: "sn_pierce", name: "관통 화살", kind: "active", cd: 5, cost: { mp: 12 }, aim: "dir", anim: "shoot", motif: "lightning",
    desc: "강력한 직선 사격으로 경로의 적에게 피해를 준다. 조준 에너지를 최대 50 소모해 에너지 1당 +1% 피해·관통.", limit: "",
    fx: { line: "projectiles/laser-bolt", hit: "impacts/crit-hit", palette: SN_PAL }, steps: [{ do: "line", length: 420, width: 34, pow: 2.6, spendR2: { max: 50, per: 0.01, pen: 0.004 } }] },
  { id: "sn_bind", name: "결박탄", kind: "active", cd: 9, cost: { mp: 12 }, aim: "dir", anim: "shoot", motif: "vines",
    desc: "선택한 적에게 사슬촉을 박아 피해를 주고 2.5초간 크게 둔화시킨다(일반 적은 1초 속박).", limit: "",
    fx: { proj: "projectiles/arrow", hit: "nature/root-snare", palette: SN_PAL }, steps: [{ do: "proj", speed: 700, range: 340, pow: 1.8, radius: 7, status: { type: "slow", dur: 2.5, v: 0.5 }, cc: { type: "root", dur: 1.0 } }] },
  PAS({ id: "sn_snipemark", name: "저격 표식", motif: "target", desc: "조준 에너지 30 이상을 소모한 사격을 맞히면 대상에게 표식을 남긴다. 표식 대상에게 주는 치명타 피해 +35%p. 새 표식은 기존 표식을 대체한다.", limit: "", passive: { p2: { snipeMark: 0.35 } } }),
  { id: "sn_scatter", name: "산개 사격", kind: "active", cd: 7, cost: { mp: 16 }, aim: "dir", anim: "shoot", motif: "twin",
    desc: "전방 부채꼴로 일곱 발을 발사해 범위 안의 적에게 각각 피해를 준다.", limit: "",
    fx: { proj: "projectiles/bullet-tracer", hit: "impacts/bullet-impact", palette: SN_PAL }, steps: [{ do: "proj", speed: 700, range: 260, pow: 1.0, count: 7, spread: 60, radius: 5 }] },
  { id: "sn_roll", name: "전술 구르기", kind: "active", cd: 7, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "구르며 위험 공격을 피해 위치를 잡은 뒤 가장 가까운 적에게 반격 사격을 가한다.", limit: "구르는 동안 조준 에너지를 쌓을 수 없다.",
    fx: { self: "spawn/poof", palette: SN_PAL }, steps: [{ do: "dash", dist: 120, speed: 580, side: true }, { do: "custom", fn: "nearestShot", range: 320, pow: 1.8 }] },
  PAS({ id: "sn_huntbreath", name: "사냥꾼의 호흡", motif: "heart", desc: "표식 대상에게 조준 에너지를 소모한 사격을 맞히면 최대 HP 5%를 회복한다. (1초마다)", limit: "", passive: { p2: { huntBreath: 0.05 } } }),
  { id: "sn_final", name: "천공의 종결탄", kind: "ultimate", cd: 30, cost: { mp: 36 }, aim: "dir", anim: "shoot", cast: 0.9, fragile: true, motif: "target",
    desc: "제자리에 깊게 조준한 뒤 조준 에너지를 모두 소모해 단일 표적에게 큰 피해를 주는 사격을 발사한다. 표식 대상에게는 방어 관통과 치명타 피해가 위협적이다.", limit: "0.9초 조준, 피격되면 끊길 수 있다.",
    fx: { line: "projectiles/laser-bolt", hit: "explosions/big-explosion", palette: SN_PAL }, steps: [{ do: "custom", fn: "snipeShot", range: 460, pow: 11, spendR2: { max: 100, per: 0.02, pen: 0.005 }, critBonus: 0.3 }] },
]);

// ─────────────── 나이트블레이드 / 그림자 칼날 ───────────────
const NB_PAL = ["#080414", "#201040", "#4a2a90", "#8060c0", "#d8c8ff", "#ffffff"];
path("nightblade", "rogue", [
  { id: "nb_star", name: "그림자 표창", kind: "basic", aspd: 0.6, aim: "dir", anim: "shoot", motif: "shadow",
    desc: "표창을 던져 지정한 적에게 물리 피해와 그림자 표식을 준다.", limit: "",
    fx: { proj: "projectiles/energy-disc", scale: 0.4, hit: "impacts/hit-spark", palette: NB_PAL }, steps: [{ do: "proj", speed: 620, range: 280, pow: 1.0, radius: 6, mark: { n: 1, max: 5, dur: 8 } }] },
  PAS({ id: "nb_brand", name: "어둠의 낙인", motif: "target", desc: "표창이나 단검으로 같은 적을 거듭 맞혀 표식이 짙어질수록 순간이동 공격이 표식 1당 +12% 어둠 피해를 준다.", limit: "표식은 다른 적에게 옮겨가지 않는다.", passive: { p2: { shadowMark: 0.12 } } }),
  { id: "nb_cloud", name: "먹구름 칼날", kind: "active", cd: 7, cost: { mp: 16 }, aim: "point", range: 300, anim: "cast", motif: "smoke",
    desc: "지정 지점에 어둠의 칼날을 퍼뜨려 범위 안의 적에게 네 번 피해를 준다. 표식 대상에게 +30%.", limit: "",
    fx: { area: "shadow/shadow-tendrils", tick: "melee/dagger-flurry", palette: NB_PAL }, steps: [{ do: "area", radius: 110, pow: 0.85, ticks: 4, interval: 0.22, vsMarkFlat: 0.3, mark: { n: 1, max: 5, dur: 8 } }] },
  { id: "nb_leap", name: "그림자 도약", kind: "active", cd: 7, aim: "dir", anim: "stab", motif: "dash",
    desc: "표식이 있는 적(없으면 조준한 적)의 등 뒤로 순간이동해 단검으로 벤다. 적중하면 다음 표창이 어둠 피해 +40%.", limit: "도약은 공격을 통과하지만 착지 위치를 골라야 한다.",
    fx: { self: "arcane/blink-out", swing: "melee/dagger-flurry", hit: "impacts/crit-hit", palette: NB_PAL }, steps: [{ do: "custom", fn: "shadowstep", range: 320, pow: 2.6, blinkAtk: true, markFirst: true }, { do: "buff", target: "self", id: "nb_dark", dur: 4, nextHit: { pow: 0.4 } }] },
  PAS({ id: "nb_afterimage", name: "잔영의 호흡", motif: "smoke", desc: "표식 대상을 처치하면 잔영이 연막을 펼쳐 3초간 회피 +30%, 이동 속도 +20%.", limit: "피해를 대신 막아 주지는 않는다.", passive: { p2: { afterimage: 0.3 } } }),
  { id: "nb_brandburst", name: "그림자 낙인", kind: "active", cd: 10, aim: "dir", anim: "stab", motif: "target",
    desc: "표식이 짙어진 단일 대상에게 단검을 던져 물리 피해를 주고 표식을 터뜨려 표식 1당 공격력 110%의 어둠 폭발을 일으킨다.", limit: "표식이 없으면 폭발하지 않는다.",
    fx: { proj: "projectiles/energy-disc", scale: 0.45, hit: "shadow/dark-explosion", palette: NB_PAL }, steps: [{ do: "proj", speed: 640, range: 300, pow: 1.8, radius: 7, markBurst: { pow: 1.1, min: 1 } }] },
  { id: "nb_eclipse", name: "월식 난무", kind: "active", cd: 9, aim: "self", anim: "spin", motif: "moon",
    desc: "주변을 여섯 번 연속으로 베어 범위 안의 적에게 반복 피해를 준다. 표식이 짙은 적을 베면 마지막 칼날이 그 대상에게 모인다.", limit: "",
    fx: { swing: "melee/spin-slash", hit: "impacts/hit-spark", palette: NB_PAL }, steps: [{ do: "custom", fn: "multiCircle", radius: 96, n: 6, gap: 0.12, pow: 0.75, lastFocus: 2.0 }] },
  PAS({ id: "nb_linger", name: "그림자 잔류", motif: "wind", desc: "그림자 도약 직후 1.5초간 이동 속도 +40%, 받는 피해 -15%로 반격선을 벗어난다.", limit: "", passive: { p2: { shadowLinger: 0.4 } } }),
  { id: "nb_execute", name: "그림자 군주의 처형", kind: "ultimate", cd: 34, aim: "dir", anim: "stab", motif: "shadow",
    desc: "표식이 짙은 적을 지정해 그림자 속으로 사라졌다가 여섯 번 연속 순간이동 베기를 하고, 표식이 3 이상이면 어둠의 낙하 칼날로 마무리한다.", limit: "시전 후 적의 공격 범위에 남을 수 있다.",
    fx: { self: "arcane/blink-out", swing: "melee/dagger-flurry", hit: "impacts/crit-hit", palette: NB_PAL }, steps: [{ do: "custom", fn: "shadowExecute", range: 340, n: 6, gap: 0.12, pow: 1.6, fall: 8.0, need: 3 }] },
]);

// ─────────────── 어쌔신 / 암살자 ───────────────
const AS_PAL = ["#180408", "#4a0a18", "#902038", "#e05070", "#ffc0d0", "#ffffff"];
path("assassin", "rogue", [
  { id: "as_stab", name: "그림자 찌르기", kind: "basic", aspd: 0.55, aim: "dir", anim: "stab", motif: "shadow",
    desc: "선택한 적 하나를 빠르게 찌른다. 배후에서 적중하면 독을 남긴다.", limit: "",
    fx: { swing: "melee/thrust", hit: "impacts/hit-spark", palette: AS_PAL }, steps: [{ do: "melee", range: 44, arc: 40, pow: 1.1, max: 1, backstab: 0.3, poisonBack: { type: "poison", dur: 5, pow: 0.4 } }] },
  PAS({ id: "as_venom", name: "맹독 각인", motif: "poison", desc: "근접 공격이 적중하면 대상에게 5초간 맹독(초당 공격력 35%)을 건다.", limit: "", passive: { p2: { venomMark: 0.35 } } }),
  { id: "as_smoke", name: "연막 도약", kind: "active", cd: 9, aim: "dir", anim: "dash", moveSkill: true, motif: "smoke",
    desc: "현재 위치에 연막을 터뜨려 주변 적에게 피해를 주고 실명시킨 뒤 지정 방향으로 도약한다.", limit: "피해를 무효화하지 않는다.",
    fx: { area: "explosions/smoke-bomb", palette: AS_PAL }, steps: [{ do: "circle", radius: 90, pow: 1.4, status: { type: "blind", dur: 3, v: 0.4 } }, { do: "dash", dist: 150, speed: 640 }] },
  { id: "as_shroud", name: "암행", kind: "active", cd: 16, aim: "self", anim: "cast", motif: "shadow",
    desc: "4초간 은신한다. 은신 중에는 적이 표적으로 삼지 못하며, 배후에서 처음 적중시키는 공격은 확정 치명타와 +120% 피해를 주고 은신을 해제한다.", limit: "공격하면 은신이 풀린다.",
    fx: { self: "spawn/dissolve-burn", palette: AS_PAL }, steps: [{ do: "custom", fn: "stealth", dur: 4 }] },
  { id: "as_twinmoon", name: "쌍월 난도", kind: "active", cd: 6, aim: "dir", anim: "combo", motif: "twin",
    desc: "쌍검을 네 번 휘둘러 전방 가까운 적에게 피해를 준다.", limit: "무리 안에 들어가야 한다.",
    fx: { swing: "melee/double-slash", hit: "impacts/hit-spark", palette: AS_PAL }, steps: [{ do: "melee", range: 56, arc: 120, pow: 0.8, hits: 4, gap: 0.1, max: 4, backstab: 0.2 }] },
  PAS({ id: "as_bloodback", name: "피의 회수", motif: "heart", desc: "독에 걸린 적을 배후에서 공격하면 최대 HP 2%를 회복한다. (0.6초마다)", limit: "근접 거리와 유리한 위치가 필요하다.", passive: { p2: { bloodReturn: 0.02 } } }),
  { id: "as_shadowwalk", name: "그림자걸음", kind: "active", cd: 7, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "지정한 적의 배후로 짧게 이동하고 2초간 다음 공격이 배후 판정을 받는다.", limit: "이동 중 무적은 없다.",
    fx: { self: "arcane/blink-out", palette: AS_PAL }, steps: [{ do: "custom", fn: "shadowstep", range: 280, pow: 0.8 }, { do: "buff", target: "self", id: "as_behind", dur: 2, mods: {} }] },
  { id: "as_sentence", name: "사형선고", kind: "active", cd: 11, aim: "dir", anim: "stab", motif: "target",
    desc: "선택한 배후의 대상에게 치명적인 일격을 가한다. 은신 중이거나 배후에서 적중하면 위력이 강화된다.", limit: "배후 +60%, 은신 +120%.",
    fx: { swing: "melee/thrust", hit: "impacts/crit-hit", palette: AS_PAL }, steps: [{ do: "melee", range: 50, arc: 40, pow: 4.2, max: 1, backstab: 0.6, stealthHit: 1.2, execute: 0.5 }] },
  { id: "as_judgement", name: "심연의 단죄", kind: "ultimate", cd: 30, aim: "dir", anim: "stab", motif: "shadow",
    desc: "은신 또는 그림자걸음으로 배후를 잡은 대상에게 결정타를 가하고, 독을 소모해 추가 타격을 일으킨다.", limit: "배후·은신이 아니면 위력이 절반. 사용 후 은신이 풀린다.",
    fx: { swing: "melee/dagger-flurry", hit: "explosions/implosion", palette: AS_PAL }, steps: [{ do: "melee", range: 54, arc: 40, pow: 11, max: 1, needBack: 0.5, stealthHit: 0.6, burstDot: 2.5 }] },
]);

// ─────────────── 트릭스터 ───────────────
const TR_PAL = ["#061404", "#183a10", "#3a7a20", "#80c850", "#d8ffa8", "#ffffff"];
path("trickster", "rogue", [
  { id: "tr_slash", name: "그림자 베기", kind: "basic", aspd: 0.55, aim: "dir", anim: "slash", motif: "arc",
    desc: "가까운 적을 빠르게 베어 피해와 출혈을 준다.", limit: "",
    fx: { swing: "melee/sword-slash", hit: "status/bleeding", palette: TR_PAL }, steps: [{ do: "melee", range: 46, arc: 80, pow: 1.0, max: 2, status: { type: "bleed", dur: 5, pow: 0.3 } }] },
  { id: "tr_needle", name: "맹독 침", kind: "active", cd: 3, cost: { mp: 6 }, aim: "dir", anim: "shoot", motif: "poison",
    desc: "지정한 적에게 독침을 던져 피해와 맹독을 준다.", limit: "",
    fx: { proj: "nature/acid-splash", scale: 0.5, hit: "status/poisoned", palette: TR_PAL }, steps: [{ do: "proj", speed: 640, range: 300, pow: 1.4, radius: 6, status: { type: "poison", dur: 8, pow: 0.5 } }] },
  { id: "tr_fog", name: "독무 살포", kind: "active", cd: 10, cost: { mp: 18 }, aim: "point", range: 280, anim: "cast", motif: "poison",
    desc: "지면에 6초간 독 안개를 퍼뜨려 범위 안의 적에게 피해와 맹독을 준다.", limit: "",
    fx: { area: "nature/poison-cloud", palette: TR_PAL }, steps: [{ do: "zone", radius: 120, dur: 6, interval: 0.75, pow: 0.75, status: { type: "poison", dur: 4, pow: 0.45 } }] },
  { id: "tr_escape", name: "연막 이탈", kind: "active", cd: 8, aim: "dir", anim: "dash", moveSkill: true, motif: "smoke",
    desc: "현재 위치에 연막을 남겨 주변 적을 실명시키고 지정 방향으로 빠르게 이동하며 경로의 적을 베어 출혈을 준다.", limit: "",
    fx: { area: "explosions/smoke-bomb", self: "spawn/poof", palette: TR_PAL }, steps: [{ do: "circle", radius: 90, pow: 0.6, status: { type: "blind", dur: 3, v: 0.4 } }, { do: "dash", dist: 160, speed: 640, hit: { pow: 1.4, status: { type: "bleed", dur: 5, pow: 0.35 } } }] },
  PAS({ id: "tr_reclaim", name: "독혈 회수", motif: "heart", desc: "맹독이나 출혈에 걸린 적을 처치하면 최대 HP 6%를 회복한다.", limit: "", passive: { p2: { dotKillHeal: 0.06 } } }),
  { id: "tr_needlestorm", name: "독침 연격", kind: "active", cd: 8, cost: { mp: 14 }, aim: "dir", anim: "stab", motif: "twin",
    desc: "단일 표적을 다섯 번 찔러 피해와 맹독을 준다. 맹독·출혈이 이미 걸린 적에게 적중하면 지속 피해를 즉시 터뜨린다.", limit: "",
    fx: { swing: "melee/dagger-flurry", hit: "status/poisoned", palette: TR_PAL }, steps: [{ do: "melee", range: 50, arc: 40, pow: 0.65, hits: 5, gap: 0.08, max: 1, status: { type: "poison", dur: 6, pow: 0.45 } }, { do: "custom", fn: "dotDetonate", range: 70, mult: 1.6 }] },
  { id: "tr_clone", name: "그림자 분신", kind: "active", cd: 16, cost: { mp: 20 }, aim: "self", anim: "cast", motif: "shadow",
    desc: "분신 둘을 10초간 소환해 적을 공격하고 표적을 분산시킨다. 분신은 피해와 출혈을 준다.", limit: "",
    fx: { self: "spawn/poof", palette: TR_PAL }, steps: [{ do: "custom", fn: "pets", skin: "clone", n: 2, dur: 10, pow: 1.0, interval: 0.6, speed: 170, bleed: true, taunt: true }] },
  PAS({ id: "tr_chaser", name: "독혈 추격자", motif: "wind", desc: "맹독·출혈 대상을 공격하면 1.5초간 이동 속도 +25%. (3초마다)", limit: "잔상은 공격을 막지 않는다.", passive: { p2: { dotChaser: 0.25 } } }),
  { id: "tr_bloom", name: "만개한 그림자 독무", kind: "ultimate", cd: 34, cost: { mp: 40 }, aim: "point", range: 300, anim: "cast", motif: "poison",
    desc: "넓은 지역을 8초간 독 안개로 덮고 그림자 분신 셋을 펼친다. 안의 적에게 맹독과 출혈을 쌓으며, 연속 공격할수록 지속 피해를 터뜨리는 그림자 일격이 발동한다.", limit: "",
    fx: { area: "nature/poison-cloud", palette: TR_PAL }, steps: [{ do: "zone", radius: 180, dur: 8, interval: 0.5, pow: 0.9, status: { type: "poison", dur: 4, pow: 0.6 }, dotPop: 0.35 }, { do: "custom", fn: "pets", skin: "clone", n: 3, dur: 8, pow: 1.1, interval: 0.6, speed: 170, bleed: true }] },
]);

// ─────────────── 인퀴지터 / 심판관 ───────────────
const IQ_PAL = ["#201806", "#605020", "#c0a040", "#ffe8a0", "#fffbe8", "#ffffff"];
path("inquisitor", "priest", [
  { id: "iq_smite", name: "신념의 강타", kind: "basic", aspd: 0.85, aim: "dir", anim: "smash", motif: "holy",
    desc: "메이스나 워해머로 전방의 적 하나를 강하게 내리쳐 신성 피해를 준다.", limit: "",
    fx: { hit: "holy/smite", hitScale: 0.6, palette: IQ_PAL }, steps: [{ do: "melee", range: 52, arc: 70, pow: 1.3, max: 1, gainOnHit: { holy: 6 } }] },
  { id: "iq_whirl", name: "성전의 회전타", kind: "active", cd: 5, aim: "self", anim: "spin", motif: "arc",
    desc: "무기를 크게 휘둘러 주변 적에게 두 번 피해를 준다.", limit: "",
    fx: { swing: "melee/spin-slash", hit: "holy/smite", palette: IQ_PAL }, steps: [{ do: "circle", radius: 100, pow: 1.5 }, { do: "custom", fn: "delayCircle", delay: 0.25, radius: 100, pow: 1.1 }] },
  PAS({ id: "iq_communion", name: "전투 성찬", motif: "heart", desc: "무기로 적을 맞히면 자신과 주변 아군의 최대 HP 1.2%를 회복한다. (0.4초마다)", limit: "실제 적중에 의존한다.", passive: { p2: { battleHeal: 0.012 } } }),
  { id: "iq_tome", name: "성서 투척", kind: "active", cd: 6, cost: { mp: 12 }, aim: "dir", anim: "cast", motif: "rune",
    desc: "성서를 전방으로 날려 경로의 적에게 신성 피해를 주고 돌아오며 다시 타격한다.", limit: "",
    fx: { proj: "holy/halo", scale: 0.5, hit: "holy/smite", palette: IQ_PAL }, steps: [{ do: "custom", fn: "boomerang", range: 280, speed: 520, pow: 1.6, radius: 18 }] },
  { id: "iq_verdict", name: "신성한 판결", kind: "active", cd: 9, cost: { holy: 15 }, aim: "dir", anim: "cast", motif: "holy",
    desc: "전방의 적 하나에게 성서의 빛을 내리쳐 피해와 신성 기절(1.5초)을 준다.", limit: "기절 면역에도 피해는 준다.",
    fx: { hit: "holy/holy-pillar", palette: IQ_PAL }, steps: [{ do: "melee", range: 120, arc: 40, pow: 2.8, max: 1, cc: { type: "stun", dur: 1.5 }, groggy: 25, interrupt: true }] },
  PAS({ id: "iq_passion", name: "수난의 반격", motif: "shield", desc: "공격을 막거나 회피하거나 이동기를 쓴 직후 3초 안의 다음 무기 강타가 +60% 신성 피해를 준다.", limit: "", passive: { p2: { passion: 0.6 } } }),
  { id: "iq_brand", name: "심판의 낙인", kind: "active", cd: 12, cost: { mp: 14 }, aim: "dir", anim: "cast", motif: "target",
    desc: "중거리의 적 하나에게 낙인을 새긴다. 낙인 대상에 무기 공격을 맞히면 표식이 쌓이고, 5개가 차면 대상과 주변 적에게 폭발 피해를 준다.", limit: "",
    fx: { proj: "holy/halo", scale: 0.4, hit: "shadow/hex-sigil", palette: IQ_PAL }, steps: [{ do: "proj", speed: 600, range: 300, pow: 1.4, radius: 8, judge: { dur: 10, need: 5, pow: 4.5, radius: 110 } }] },
  { id: "iq_martyr", name: "순교자의 돌진", kind: "active", cd: 10, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "지정 방향으로 돌진해 경로의 적에게 신성 피해를 주고 밀어내며, 도착 지점에서 2초간 받는 피해 -20%.", limit: "돌진 중 방향 전환 불가.",
    fx: { self: "holy/feather-burst", hit: "holy/smite", palette: IQ_PAL }, steps: [{ do: "dash", dist: 180, speed: 620, hit: { pow: 2.0, knock: 50 } }, { do: "buff", target: "self", id: "iq_stance", dur: 2, mods: { dr: 0.2 } }] },
  { id: "iq_gospel", name: "최후의 복음", kind: "ultimate", cd: 36, cost: { holy: 30 }, aim: "self", anim: "channel", motif: "holy",
    desc: "성서를 펼쳐 2초간 주변 적에게 다섯 번 신성 타격을 가하고 마지막 일격으로 큰 범위 피해와 기절을 준다. 적중한 적마다 자신과 주변 아군을 회복한다.", limit: "시전 중 이동할 수 없다.",
    fx: { self: "holy/sunburst", area: "holy/holy-pillar", palette: IQ_PAL }, steps: [{ do: "custom", fn: "gospel", radius: 150, n: 5, gap: 0.35, pow: 1.4, final: 6.5, finalRadius: 190, heal: 0.015 }] },
]);

// ─────────────── 이단사제 ───────────────
const HT_PAL = ["#180410", "#4a0c30", "#902060", "#d060a0", "#ffc0e8", "#ffffff"];
path("heretic", "priest", [
  { id: "ht_bullet", name: "불경한 탄환", kind: "basic", aspd: 0.8, aim: "dir", anim: "cast", motif: "shadow",
    desc: "지정한 적에게 타락한 신성력의 탄환을 발사해 안정적인 단일 피해를 준다.", limit: "",
    fx: { proj: "shadow/void-orb", scale: 0.42, hit: "holy/smite", palette: HT_PAL }, steps: [{ do: "proj", speed: 540, range: 300, pow: 1.35, radius: 7, gainOnHit: { holy: 4 } }] },
  PAS({ id: "ht_foresight", name: "눈먼 예지", motif: "target", desc: "적의 공격을 회피하거나 적 근처에서 이동기를 쓰면 예언의 잔향 15를 얻는다. (0.8초마다)", limit: "", passive: { p2: { foresight: 15 } } }),
  { id: "ht_profane", name: "부패 성화", kind: "active", cd: 8, cost: { mp: 16 }, aim: "point", range: 300, anim: "cast", motif: "flame",
    desc: "지정 지점에 타락한 성화를 터뜨려 피해를 주고 5초간 남은 성화로 계속 태운다.", limit: "",
    fx: { area: "fire/flame-pillar", palette: HT_PAL }, steps: [{ do: "area", radius: 100, pow: 2.0, telegraph: 0.15 }, { do: "zone", radius: 100, dur: 5, interval: 1, pow: 0.6, status: { type: "burn", dur: 3, pow: 0.35 } }] },
  { id: "ht_doom", name: "유예된 종말", kind: "active", cd: 14, cost: { r2: 20 }, aim: "self", anim: "cast", motif: "rune",
    desc: "예언의 잔향 20을 소모해 6초 안에 받는 피해의 60%를 2초 뒤의 메아리로 미룬다. 메아리가 오기 전 위치를 바꾸거나 공격할 시간을 번다.", limit: "피해를 없애지는 않는다.",
    fx: { self: "arcane/time-stop", palette: HT_PAL }, steps: [{ do: "custom", fn: "doomDelay", dur: 6, pct: 0.6, delay: 2 }] },
  { id: "ht_judgemark", name: "심판의 낙인", kind: "active", cd: 10, cost: { mp: 14 }, aim: "dir", anim: "cast", motif: "target",
    desc: "적 하나에게 10초간 심판의 낙인을 새겨 지속 피해를 준다. 낙인 대상에게 가한 공격 피해의 8%가 공격자에게 생명력으로 돌아온다(아군 포함).", limit: "",
    fx: { proj: "shadow/curse", scale: 0.5, hit: "shadow/hex-sigil", palette: HT_PAL }, steps: [{ do: "proj", speed: 600, range: 320, pow: 1.5, radius: 8, judged: 10, status: { type: "burn", dur: 10, pow: 0.4 } }] },
  { id: "ht_sinleap", name: "죄악의 도약", kind: "active", cd: 8, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "이동 방향으로 도약해 공격선을 벗어나고, 지나간 자리에 균열을 남겨 닿은 적에게 피해를 준다.", limit: "",
    fx: { self: "shadow/shadow-flames", palette: HT_PAL }, steps: [{ do: "custom", fn: "trailLeap", dist: 160, speed: 620, pow: 1.6, width: 50 }] },
  { id: "ht_bloodflow", name: "성혈 역류", kind: "active", cd: 11, cost: { mp: 20 }, aim: "dir", anim: "channel", motif: "heart",
    desc: "대상 하나에 타락한 성혈을 2초 동안 흘려 반복 피해를 주고, 피해의 30%만큼 생명력을 회복한다.", limit: "시전 중 움직임과 회피가 제한된다.",
    fx: { hit: "shadow/life-steal", palette: HT_PAL }, steps: [{ do: "custom", fn: "drainTether", range: 280, ticks: 6, interval: 0.33, pow: 0.95, lifesteal: 0.3, root: true }] },
  PAS({ id: "ht_testimony", name: "메아리의 증언", motif: "wave", desc: "유예된 종말의 메아리가 발생하면 주변 적에게 파열 피해(공격력 300%)를 준다. 심판의 낙인이 찍힌 적이 휩쓸리면 그 피해로 자신도 회복한다.", limit: "", passive: { p2: { testimony: 3 } } }),
  { id: "ht_lastjudge", name: "이단의 최후심판", kind: "ultimate", cd: 34, cost: { mp: 40 }, aim: "point", range: 340, anim: "cast", cast: 0.6, motif: "meteor",
    desc: "예언의 잔향을 모두 소모해 지정 지점에 큰 범위 폭발을 일으키고(잔향 1당 +1.5%), 휩쓸린 심판의 낙인을 터뜨려 추가 피해를 준다. 낙인 폭발 피해는 자신과 아군의 생명력으로 돌아온다.", limit: "",
    fx: { area: "shadow/dark-explosion", pre: "arcane/magic-circle-cast", palette: HT_PAL }, steps: [{ do: "area", radius: 180, pow: 9.0, telegraph: 0.3, spendR2: { max: 100, per: 0.015 }, judgeBurst: { pow: 3, heal: 0.25 } }] },
]);

// ─────────────── 볼케이노 / 용광로 파괴자 ───────────────
const VO_PAL = ["#200400", "#801800", "#e04010", "#ff9030", "#ffe090", "#ffffff"];
path("volcano", "smith", [
  { id: "vo_wedge", name: "용암 쐐기", kind: "basic", aspd: 0.95, aim: "dir", anim: "smash", motif: "forge",
    desc: "워해머에 열기를 모아 지정한 적을 내리쳐 피해를 주고 화상을 입힌다.", limit: "",
    fx: { hit: "fire/fire-ring", hitScale: 0.4, palette: VO_PAL }, steps: [{ do: "melee", range: 54, arc: 90, pow: 1.0, max: 2, status: { type: "burn", dur: 3, pow: 0.25 } }] },
  { id: "vo_fissure", name: "용암 균열", kind: "active", cd: 7, aim: "dir", anim: "smash", motif: "flame",
    desc: "전방 지면을 강타해 부채꼴 범위의 적에게 피해를 주고 5초간 용암 균열을 남긴다. 균열 위의 적은 지속 피해를 받는다.", limit: "",
    fx: { swing: "melee/hammer-smash", area: "fire/campfire", hit: "fire/fire-ring", palette: VO_PAL }, steps: [{ do: "melee", range: 110, arc: 120, pow: 1.8 }, { do: "custom", fn: "frontZone", dist: 70, radius: 90, dur: 5, interval: 0.8, pow: 0.6, burn: true }] },
  PAS({ id: "vo_furnace", name: "용광로 압박", motif: "forge", desc: "볼케이노 기술이 적중할 때마다 대상의 방어력 -3%·공격력 -2%를 전투 중 영구 누적한다. (일반 적 최대 10중첩, 정예 6, 보스 5)", limit: "대상이 쓰러지면 사라진다.", passive: { p2: { furnace: true } } }),
  { id: "vo_chain", name: "용광로 사슬", kind: "active", cd: 9, aim: "dir", anim: "shoot", motif: "vines",
    desc: "사슬 달린 워해머를 던져 처음 맞은 적에게 피해를 주고 자신 쪽으로 끌어당긴다.", limit: "보스는 끌려오지 않는다.",
    fx: { proj: "projectiles/cannonball", scale: 0.5, hit: "impacts/heavy-landing", palette: VO_PAL }, steps: [{ do: "proj", speed: 600, range: 300, pow: 2.0, radius: 10, pullIn: 220, threat: 3 }] },
  PAS({ id: "vo_crucible", name: "복수의 도가니", motif: "shield", desc: "압박이 누적된 적을 근접 타격하면 4초간 최대 HP 4% 보호막을 얻고 1.5%를 회복한다. (1.5초마다)", limit: "", passive: { p2: { crucible: 0.04 } } }),
  { id: "vo_leap", name: "화산 도약", kind: "active", cd: 10, aim: "point", range: 260, anim: "smash", moveSkill: true, motif: "meteor",
    desc: "지정 지점으로 도약해 지면을 강타하고 주변 적에게 피해를 준다.", limit: "",
    fx: { area: "fire/meteor", palette: VO_PAL }, steps: [{ do: "custom", fn: "leapTo", range: 260 }, { do: "circle", radius: 110, pow: 2.2, groggy: 18, status: { type: "burn", dur: 4, pow: 0.3 } }] },
  PAS({ id: "vo_riftchase", name: "균열 추격", motif: "flame", desc: "화상을 입은 적에게 주는 피해 +20%, 균열 안에서 워해머 기술을 맞히면 화상 지속 피해가 강화된다.", limit: "", passive: { p2: { riftChase: 0.2 } } }),
  { id: "vo_eruption", name: "분화 강타", kind: "active", cd: 13, cost: { parts: 1 }, aim: "self", anim: "smash", motif: "impact",
    desc: "워해머를 지면에 박아 주변 용암 지대를 폭발시키고 범위 내 적에게 큰 피해를 준다. 압박이 쌓인 적에게 중첩당 +6%.", limit: "",
    fx: { area: "explosions/big-explosion", hit: "fire/fire-ring", palette: VO_PAL }, steps: [{ do: "circle", radius: 150, pow: 4.4, vsShred: 0.06, groggy: 30, eruptZones: true }] },
  { id: "vo_heartfall", name: "화산심장 낙하", kind: "ultimate", cd: 38, cost: { parts: 2 }, aim: "self", anim: "smash", motif: "meteor",
    desc: "양손 워해머를 내리꽂아 주변 적을 충격 중심으로 끌어당기고 8초간 용암 분화대를 일으켜 범위 직접·지속 피해를 준다. 압박이 누적된 적일수록 직접 피해가 커진다.", limit: "",
    fx: { area: "fire/fire-tornado", hit: "explosions/big-explosion", palette: VO_PAL }, steps: [{ do: "custom", fn: "gather", radius: 220, pull: 140, pow: 0 }, { do: "circle", radius: 170, pow: 7.5, vsShred: 0.08, groggy: 60 }, { do: "zone", at: "self", radius: 160, dur: 8, interval: 0.6, pow: 0.7, status: { type: "burn", dur: 3, pow: 0.4 } }] },
]);

// ─────────────── 메카닉 / 공성공학자 ───────────────
const ME_PAL = ["#021420", "#0a3a5a", "#2080b0", "#60c8ff", "#d0f0ff", "#ffffff"];
path("mechanic", "smith", [
  { id: "me_rivet", name: "리벳 연사기", kind: "basic", aspd: 0.8, aim: "dir", anim: "shoot", motif: "ray",
    desc: "전방의 적에게 리벳을 세 발 연속 발사해 반복 피해를 준다.", limit: "",
    fx: { proj: "projectiles/bullet-tracer", hit: "impacts/bullet-impact", palette: ME_PAL }, steps: [{ do: "proj", speed: 700, range: 280, pow: 0.42, count: 3, burst: 0.07, radius: 5 }] },
  { id: "me_turret", name: "자동 포탑 전개", kind: "active", cd: 14, cost: { parts: 1 }, aim: "point", range: 200, anim: "cast", motif: "orbit",
    desc: "지정 지점에 자동 포탑을 18초간 설치해 사거리 안의 적을 0.5초마다 사격한다.", limit: "포탑은 동시에 2개까지.",
    fx: { self: "scifi/warp-in", palette: ME_PAL }, steps: [{ do: "custom", fn: "turret", dur: 18, pow: 0.75, interval: 0.5, range: 300, max: 2 }] },
  { id: "me_golem", name: "강철 골렘 유인기", kind: "active", cd: 22, cost: { parts: 1 }, aim: "point", range: 160, anim: "cast", motif: "forge",
    desc: "강철 골렘을 보내 14초간 주변 적의 주의를 끌고 근접 공격으로 피해를 준다.", limit: "",
    fx: { self: "spawn/summon-rise", palette: ME_PAL }, steps: [{ do: "device", kind: "golem", dur: 14, hp: 1, pow: 1.8 }] },
  { id: "me_nail", name: "관통 못포", kind: "active", cd: 6, aim: "dir", anim: "shoot", motif: "lightning",
    desc: "전방 직선으로 대형 못을 발사해 관통한 적 모두에게 피해를 준다.", limit: "",
    fx: { line: "projectiles/rocket", hit: "impacts/crit-hit", palette: ME_PAL }, steps: [{ do: "line", length: 360, width: 40, pow: 2.6, pen: 0.2 }] },
  { id: "me_barricade", name: "전술 바리케이드", kind: "active", cd: 12, aim: "dir", anim: "cast", motif: "shield",
    desc: "지정 방향에 엄폐물을 12초간 세워 적의 이동을 막고, 뒤에 선 아군의 받는 피해를 줄인다.", limit: "적이 우회하거나 파괴할 수 있다.",
    fx: { self: "scifi/force-field", palette: ME_PAL }, steps: [{ do: "device", kind: "wall", dur: 12, dist: 70, hp: 1 }] },
  { id: "me_bash", name: "아머 방패치기", kind: "active", cd: 7, aim: "dir", anim: "smash", motif: "shield",
    desc: "파워 아머의 방패로 전방의 적을 타격해 피해를 주고 멀리 밀쳐낸다.", limit: "",
    fx: { hit: "impacts/shield-block", palette: ME_PAL }, steps: [{ do: "melee", range: 58, arc: 100, pow: 2.0, knock: 90, interrupt: true, groggy: 20 }] },
  PAS({ id: "me_steam", name: "마도 증기 순환", motif: "orbit", desc: "직접 공격이나 설치물 공격이 적중하면 증기 압력 4를 회복한다. (0.15초마다)", limit: "가득 찬 동안의 추가 회복은 낭비된다.", passive: { p2: { steam: 4 } } }),
  { id: "me_overload", name: "과부하 방출", kind: "active", cd: 10, aim: "self", anim: "smash", motif: "lightning",
    desc: "축적한 증기 압력을 모두 방출해 주변 적에게 피해를 주고 밀쳐낸다. 압력 1당 +3% 피해.", limit: "압력이 없으면 위력이 약하다.",
    fx: { area: "scifi/emp-blast", hit: "lightning/zap-hit", palette: ME_PAL }, steps: [{ do: "circle", radius: 140, pow: 2.0, knock: 70, spendR2: { max: 100, per: 0.03 } }] },
  { id: "me_fortress", name: "성채 전개: 아르키메데스", kind: "ultimate", cd: 40, cost: { parts: 2 }, aim: "point", range: 200, anim: "cast", motif: "forge",
    desc: "지정 지점에 전술 성채를 펼쳐 바리케이드 둘과 강화 포탑 둘을 결합하고 강철 골렘으로 적을 끌어들인다. 성채 포격은 15초간 지속된다.", limit: "성채는 위치가 고정된다.",
    fx: { self: "scifi/warp-in", palette: ME_PAL }, steps: [{ do: "custom", fn: "fortress", dur: 15, pow: 1.1, interval: 0.4, range: 320 }] },
]);

// ─────────────── 모험가의 왕 ───────────────
const KG_PAL = ["#201406", "#604010", "#c09030", "#ffd35a", "#fff4c0", "#ffffff"];
path("king", "adventurer", [
  { id: "kg_strike", name: "개척자의 일격", kind: "active", cd: 1.6, aim: "dir", anim: "thrust", motif: "ray",
    desc: "전방의 적 하나를 빠르게 찔러 피해를 주고 개척의 기세 10을 얻는다. 재사용 대기 중에도 찌르기·베기를 쓸 수 있다.", limit: "",
    fx: { swing: "melee/thrust", hit: "impacts/crit-hit", palette: KG_PAL }, steps: [{ do: "melee", range: 62, arc: 40, pow: 2.2, max: 1, r2OnHit: 10 }] },
  PAS({ id: "kg_adapt", name: "현장 적응", motif: "crest", desc: "찌르기·베기·대시와 왕의 기술을 서로 다른 종류로 번갈아 적중시키면 개척의 기세 12를 얻는다. (0.3초마다)", limit: "같은 기본기만 반복하면 얻지 못한다.", passive: { p2: { adapt: 12 } } }),
  { id: "kg_arc", name: "개척자의 원호", kind: "active", cd: 5, aim: "self", anim: "spin", motif: "arc",
    desc: "주변을 넓게 베어 가까운 적에게 피해를 준다. 적중한 적마다 기세 4를 얻는다(최대 20).", limit: "",
    fx: { swing: "melee/spin-slash", hit: "impacts/hit-spark", palette: KG_PAL }, steps: [{ do: "circle", radius: 100, pow: 2.0, r2PerHit: 4, r2Cap: 20 }] },
  { id: "kg_aid", name: "노련한 응급처치", kind: "active", cd: 14, cost: { r2: 20 }, aim: "self", anim: "cast", cast: 0.5, motif: "heart",
    desc: "기세 20을 소모해 생명력 25%를 회복하고 4초간 받는 피해 -15%.", limit: "시전 중 공격을 피할 수 없다.",
    fx: { self: "holy/heal", palette: ["#0a2a10", "#1d6b2a", "#3fae4a", "#8fe88a", "#d8ffd0", "#ffffff"] }, steps: [{ do: "heal", target: "self", pctMax: 0.25 }, { do: "buff", target: "self", id: "kg_aid", dur: 4, mods: { dr: 0.15 } }] },
  { id: "kg_breach", name: "돌파 대시", kind: "active", cd: 7, aim: "dir", anim: "dash", moveSkill: true, motif: "dash",
    desc: "지정 방향으로 빠르게 돌진해 경로의 적에게 피해를 주고 반대편으로 빠져나온다. 적중하면 기세 10.", limit: "",
    fx: { self: "spawn/poof", hit: "impacts/hit-spark", palette: KG_PAL }, steps: [{ do: "dash", dist: 180, speed: 660, hit: { pow: 2.0, r2OnHit: 10 } }] },
  { id: "kg_royal", name: "왕도 찌르기", kind: "active", cd: 8, aim: "dir", anim: "thrust", cast: 0.3, motif: "ray",
    desc: "짧게 자세를 잡은 뒤 전방의 적 하나를 꿰뚫어 큰 피해를 준다. 기세를 최대 40 소모해 기세 1당 +2.5% 강화.", limit: "",
    fx: { swing: "melee/thrust", hit: "impacts/crit-hit", palette: KG_PAL }, steps: [{ do: "melee", range: 84, arc: 30, pow: 4.0, max: 1, pen: 0.25, spendR2: { max: 40, per: 0.025 } }] },
  PAS({ id: "kg_fieldsense", name: "노련한 야전 감각", motif: "shield", desc: "개척의 기세가 10 이상일 때 이동기 직후 2초 안에 처음 받는 적중 피해를 40% 줄인다.", limit: "무한히 버티게 하지는 않는다.", passive: { p2: { fieldSense: 0.4 } } }),
  { id: "kg_captain", name: "원정대장 연격", kind: "active", cd: 9, aim: "dir", anim: "combo", motif: "twin",
    desc: "전방의 적 하나에게 찌르기와 베기를 네 번 잇달아 가한다. 기세 20을 소모할 수 있으면 마지막 일격이 주변 적에게도 피해를 준다.", limit: "",
    fx: { swing: "melee/double-slash", hit: "impacts/hit-spark", palette: KG_PAL }, steps: [{ do: "melee", range: 60, arc: 60, pow: 0.9, hits: 4, gap: 0.1, max: 1 }, { do: "custom", fn: "captainFinish", radius: 110, pow: 2.4, cost: 20 }] },
  { id: "kg_march", name: "모험왕의 진격", kind: "ultimate", cd: 32, aim: "dir", anim: "dash", motif: "dash",
    desc: "개척의 기세를 모두 소모해 지정 방향으로 진격하며 경로의 적을 연속 타격하고 마지막에 도달한 적에게 강한 일격을 가한다(기세 1당 +3%). 적을 쓰러뜨리면 6초간 기세 획득량이 두 배가 된다.", limit: "빗나가거나 막히면 기세를 잃는다.",
    fx: { self: "melee/spear-sweep", hit: "impacts/crit-hit", palette: KG_PAL }, steps: [{ do: "custom", fn: "kingMarch", dist: 260, speed: 700, pow: 2.5, final: 8.0, per: 0.03 }] },
]);
