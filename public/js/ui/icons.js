// 아이템 아이콘 (작은 픽셀 그림)
import { RARITY_COLOR } from "/shared/items.js";

const cache = new Map();
const P = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const MAT = ["#9a6a3a", "#c08a50", "#c0c8d8", "#e8edf6", "#9ae0ff", "#5a5a6a", "#c8a0ff", "#f0e0c0", "#ffffff", "#ff6080"];

export function itemIcon(it) {
  const key = `${it.slot}|${it.type}|${it.variant}|${it.rarity}|${Math.floor((it.ilvl - 1) / 10)}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement("canvas");
  cv.width = 18; cv.height = 18;
  const g = cv.getContext("2d");
  const m = MAT[Math.min(9, Math.floor((it.ilvl - 1) / 10))], r = RARITY_COLOR[it.rarity] ?? "#ccc", ink = "#14101c", wood = "#8a5a32";
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
  cache.set(key, cv);
  return cv;
}
