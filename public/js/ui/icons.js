// 아이템 아이콘 (작은 픽셀 그림)
import { RARITY_COLOR } from "/shared/items.js";

const cache = new Map();
const P = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const MAT = ["#9a6a3a", "#c08a50", "#c0c8d8", "#e8edf6", "#9ae0ff", "#5a5a6a", "#c8a0ff", "#f0e0c0", "#ffffff", "#ff6080"];

export function itemIcon(it) {
  const key = `${it.slot}|${it.type}|${it.variant}|${it.rarity}|${Math.floor((it.ilvl - 1) / 10)}|${it.relic ?? ""}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement("canvas");
  cv.width = 18; cv.height = 18;
  const g = cv.getContext("2d");
  const m = MAT[Math.min(9, Math.floor((it.ilvl - 1) / 10))], r = RARITY_COLOR[it.rarity] ?? "#ccc", ink = "#14101c", wood = "#8a5a32";
  const edge = it.relicColor ?? r;
  // 정돈된 메탈 프레임 + 딥 네이비 인레이. 그림 자체는 픽셀 실루엣을 유지한다.
  P(g, "#080b13", 0, 0, 18, 18);
  P(g, "#1a2030", 1, 1, 16, 16);
  P(g, "#303b50", 1, 1, 16, 1);
  P(g, "#0c101a", 1, 16, 16, 1);
  P(g, edge, 0, 0, 18, 1); P(g, edge, 0, 17, 18, 1);
  P(g, edge, 0, 1, 1, 16); P(g, edge, 17, 1, 1, 16);
  P(g, "#ffffff", 2, 2, 3, 1); P(g, "#ffffff", 2, 3, 1, 1);
  switch (it.slot) {
    case "weapon":
      switch (it.type) {
        case "club": P(g, ink, 4, 4, 9, 9); for (let k = 0; k < 9; k++) P(g, k < 5 ? wood : "#b07a42", 4 + k, 13 - k, 2 + (k > 4 ? 1 : 0), 2); break;
        case "sword": case "greatsword": for (let k = 0; k < 10; k++) P(g, m, 5 + k, 12 - k, 2, 2); P(g, "#ffd84a", 3, 11, 6, 2); P(g, wood, 2, 14, 3, 2); break;
        case "dagger": for (let k = 0; k < 6; k++) P(g, m, 7 + k, 10 - k, 2, 2); P(g, "#ffd84a", 5, 10, 4, 2); P(g, wood, 4, 12, 2, 3); break;
        case "bow": for (let k = 0; k < 12; k++) P(g, wood, 6 + Math.round(Math.sin((k / 11) * Math.PI) * 5), 3 + k, 2, 1); P(g, "#eee", 6, 3, 1, 12); break;
        case "staff": for (let k = 0; k < 12; k++) P(g, wood, 4 + k, 15 - k, 1, 1); P(g, "#7ff0ff", 13, 1, 4, 4); P(g, "#fff", 14, 2, 1, 1); break;
        case "mace": for (let k = 0; k < 7; k++) P(g, wood, 4 + k, 14 - k, 1, 1); P(g, m, 10, 3, 6, 6); P(g, "#fff", 11, 4, 2, 1); break;
        case "hammer": for (let k = 0; k < 8; k++) P(g, wood, 4 + k, 15 - k, 1, 1); P(g, m, 9, 2, 8, 5); P(g, ink, 9, 7, 8, 1); break;
        case "knuckle": P(g, m, 4, 6, 10, 6); P(g, ink, 4, 9, 10, 1); for (let k = 0; k < 4; k++) P(g, "#fff", 5 + k * 2, 6, 1, 1); break;
      }
      break;
    case "offhand":
      if (it.type === "shield") { P(g, ink, 3, 2, 12, 14); P(g, it.ilvl <= 10 ? wood : m, 4, 3, 10, 12); P(g, "#666a78", 8, 3, 2, 12); P(g, "#fff8", 5, 4, 2, 4); }
      else if (it.type === "quiver") { P(g, wood, 6, 5, 6, 11); for (let k = 0; k < 3; k++) P(g, "#e8e8e8", 6 + k * 2, 1, 1, 5); }
      else if (it.type === "tome") { P(g, "#4a2a6a", 4, 3, 10, 12); P(g, "#ffd84a", 8, 7, 2, 3); P(g, "#e8dcc8", 13, 4, 1, 10); }
      else { for (let k = 0; k < 6; k++) P(g, m, 7 + k, 10 - k, 2, 2); P(g, wood, 4, 12, 3, 3); }
      break;
    case "helmet": P(g, ink, 3, 4, 12, 10); P(g, m, 4, 5, 10, 8); P(g, ink, 6, 9, 6, 1); P(g, "#fff8", 5, 6, 3, 1); break;
    case "armor": P(g, ink, 3, 3, 12, 13); P(g, m, 4, 4, 10, 11); P(g, ink, 8, 4, 2, 11); P(g, "#fff6", 5, 5, 2, 4); P(g, ink, 3, 3, 3, 2); P(g, ink, 12, 3, 3, 2); break;
    case "trinket": P(g, "#ffd84a", 5, 4, 8, 1); P(g, "#ffd84a", 4, 5, 1, 6); P(g, "#ffd84a", 13, 5, 1, 6); P(g, "#ffd84a", 5, 11, 8, 1); P(g, r, 7, 7, 4, 3); break;
  }
  // 등급 보석과 상단 하이라이트. 작은 아이콘에서도 희귀도와 유물 여부가 구분된다.
  P(g, edge, 14, 2, 2, 2);
  P(g, "#ffffff", 14, 2, 1, 1);
  if (it.relic) { P(g, "#ffffff", 13, 5, 1, 1); P(g, edge, 14, 5, 2, 1); }
  cache.set(key, cv);
  return cv;
}

// ── 스킬 아이콘: 스킬 종류(근접·투사체·범위·버프·회복·이동…)로 모양, 이펙트 속성(불·얼음·신성…)으로 색
const ELEM = [["fire", "#ff8a3a"], ["ice", "#8ae6ff"], ["holy", "#ffe27a"], ["shadow", "#b47aff"], ["nature", "#7ae06a"], ["arcane", "#d08cff"], ["lightning", "#fff05a"], ["explosions", "#ff6a3a"], ["scifi", "#6affe0"], ["weather", "#9ad0ff"]];
const GRADE_TINT = { 일반: "#d8dde6", 희귀: "#6ab4ff", 영웅: "#d8b0ff", 전설: "#ffbe5a", 신화: "#ff6a7a" };
export function skillColor(sk) {
  const fx = JSON.stringify(sk.fx ?? {});
  for (const [k, c] of ELEM) if (fx.includes(`"${k}/`)) return c;
  return GRADE_TINT[sk.grade] ?? "#d8dde6";
}
function kindOf(sk) {
  const ds = (sk.steps ?? []).map((s) => s.do);
  if (sk.kind === "passive") return "passive";
  if (ds.includes("heal")) return "heal";
  if (ds.includes("dash") || ds.includes("blink")) return "dash";
  if (ds.includes("shield")) return "shield";
  if (ds.includes("parry")) return "parry";
  if (ds.includes("taunt")) return "taunt";
  if (ds.includes("device")) return "device";
  if (ds.includes("channel")) return "channel";
  if (ds.includes("proj") || ds.includes("line")) return sk.anim === "shoot" ? "arrow" : "bolt";
  if (ds.includes("zone")) return "zone";
  if (ds.includes("area") || ds.includes("circle")) return "burst";
  if (ds.includes("melee")) return sk.anim === "thrust" ? "thrust" : "slash";
  if (ds.includes("buff")) return "buff";
  return "star";
}
const urls = new Map();
/** 스킬 아이콘 이미지 주소 (버튼용) */
export function skillIconURL(sk) {
  // 무기별 기본 공격은 그 무기 그림으로
  if (!urls.has(sk.id) && sk.weaponBasic) urls.set(sk.id, itemIcon({ slot: "weapon", type: sk.weaponBasic, variant: 0, rarity: "일반", ilvl: 21 }).toDataURL());
  if (!urls.has(sk.id)) urls.set(sk.id, skillIcon(sk).toDataURL());
  return urls.get(sk.id);
}
export function skillIcon(sk) {
  const key = "sk:" + sk.id;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement("canvas");
  cv.width = 16; cv.height = 16;
  const g = cv.getContext("2d");
  const c = skillColor(sk), ink = "#120e1a", wh = "#ffffff";
  const line = (pts, col, w = 1) => { for (const [x, y] of pts) P(g, col, x, y, w, w); };
  switch (kindOf(sk)) {
    case "slash": for (let k = 0; k < 11; k++) { const a = -0.9 + k * 0.17; const x = Math.round(8 + Math.cos(a) * 6), y = Math.round(9 + Math.sin(a) * 6); P(g, ink, x - 1, y - 1, 3, 3); } for (let k = 0; k < 11; k++) { const a = -0.9 + k * 0.17; P(g, k > 7 ? wh : c, Math.round(8 + Math.cos(a) * 6), Math.round(9 + Math.sin(a) * 6), 2, 2); } break;
    case "thrust": P(g, ink, 1, 6, 14, 4); P(g, c, 2, 7, 10, 2); P(g, wh, 12, 7, 2, 2); P(g, wh, 14, 7, 1, 2); P(g, c, 3, 5, 2, 6); break;
    case "arrow": P(g, ink, 1, 6, 14, 4); P(g, "#c89060", 2, 7, 9, 2); P(g, c, 11, 6, 2, 4); P(g, wh, 13, 7, 2, 2); P(g, c, 2, 5, 2, 1); P(g, c, 2, 10, 2, 1); break;
    case "bolt": P(g, ink, 5, 4, 10, 8); P(g, c, 6, 5, 8, 6); P(g, wh, 9, 6, 4, 4); line([[1, 7], [3, 8], [2, 10], [4, 6]], c); break;
    case "burst": for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; for (let r = 2; r < 7; r++) P(g, r > 4 ? c : wh, Math.round(8 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r), 1, 1); } P(g, wh, 7, 7, 2, 2); break;
    case "zone": for (const r of [6, 3]) for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; P(g, r === 6 ? c : wh, Math.round(8 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r * 0.7), 1, 1); } break;
    case "buff": for (const oy of [2, 7]) { line([[3, oy + 5], [4, oy + 4], [5, oy + 3], [6, oy + 2], [7, oy + 1], [8, oy], [9, oy + 1], [10, oy + 2], [11, oy + 3], [12, oy + 4], [13, oy + 5]], ink, 2); line([[4, oy + 4], [5, oy + 3], [6, oy + 2], [7, oy + 1], [8, oy], [9, oy + 1], [10, oy + 2], [11, oy + 3], [12, oy + 4]], oy === 2 ? wh : c, 1); } break;
    case "heal": P(g, ink, 5, 1, 6, 14); P(g, ink, 1, 5, 14, 6); P(g, c, 6, 2, 4, 12); P(g, c, 2, 6, 12, 4); P(g, wh, 7, 3, 2, 4); break;
    case "shield": P(g, ink, 2, 1, 12, 10); P(g, ink, 4, 11, 8, 3); P(g, ink, 6, 14, 4, 1); P(g, c, 3, 2, 10, 8); P(g, c, 5, 10, 6, 3); P(g, c, 7, 13, 2, 1); P(g, wh, 4, 3, 3, 3); break;
    case "dash": for (const ox of [2, 7]) { line([[ox, 3], [ox + 1, 4], [ox + 2, 5], [ox + 3, 6], [ox + 4, 7], [ox + 4, 8], [ox + 3, 9], [ox + 2, 10], [ox + 1, 11], [ox, 12]], ink, 2); line([[ox, 4], [ox + 1, 5], [ox + 2, 6], [ox + 3, 7], [ox + 3, 8], [ox + 2, 9], [ox + 1, 10], [ox, 11]], ox === 7 ? wh : c, 1); } break;
    case "parry": for (let k = 0; k < 12; k++) { P(g, ink, 1 + k, 1 + k, 3, 3); P(g, ink, 12 - k, 1 + k, 3, 3); } for (let k = 0; k < 12; k++) { P(g, c, 2 + k, 2 + k, 1, 1); P(g, wh, 13 - k, 2 + k, 1, 1); } break;
    case "taunt": P(g, ink, 6, 1, 4, 10); P(g, ink, 6, 12, 4, 3); P(g, c, 7, 2, 2, 8); P(g, c, 7, 13, 2, 1); break;
    case "device": P(g, ink, 3, 3, 10, 10); P(g, c, 4, 4, 8, 8); P(g, ink, 6, 6, 4, 4); P(g, wh, 7, 7, 2, 2); for (const [x, y] of [[7, 1], [7, 13], [1, 7], [13, 7]]) P(g, c, x, y, 2, 2); break;
    case "channel": for (let k = 0; k < 20; k++) { const a = k * 0.55, r = 1 + k * 0.32; P(g, k > 14 ? wh : c, Math.round(8 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r), 1, 1); } break;
    case "passive": P(g, ink, 4, 4, 8, 8); P(g, c, 5, 5, 6, 6); P(g, ink, 7, 7, 2, 2); break;
    default: line([[8, 1], [8, 2], [7, 3], [9, 3], [1, 6], [2, 6], [3, 6], [13, 6], [14, 6], [15, 6]], c); P(g, c, 5, 4, 6, 7); P(g, wh, 7, 6, 2, 2); P(g, c, 3, 11, 2, 3); P(g, c, 11, 11, 2, 3);
  }
  centerArt(cv);
  cache.set(key, cv);
  return cv;
}

/** 그림이 칸 한쪽으로 치우쳐 있으면 가운데로 옮김 (16x16 아이콘) */
function centerArt(cv) {
  const g = cv.getContext("2d"), W = cv.width, H = cv.height;
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return;
  const dx = Math.round((W - 1 - x1 - x0) / 2), dy = Math.round((H - 1 - y1 - y0) / 2);
  if (!dx && !dy) return;
  const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H;
  tmp.getContext("2d").drawImage(cv, 0, 0);
  g.clearRect(0, 0, W, H); g.drawImage(tmp, dx, dy);
}
