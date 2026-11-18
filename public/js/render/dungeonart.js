// 던전 지형지물 그림: 돌기둥, 벽 분수(용암/물), 룬 마법진, 빛나는 수정, 벽가 소품, 구역별 바닥 무늬, 가시 함정.
// 빛은 glow.js로 모아 어둠 속에서 색이 번지게 한다.
import { G } from "../game.js";
import { frame, drawFoot, animName } from "./dt2.js";
import { addGlow } from "./glow.js";

const CRYSTAL = { "화염 용광로": 0, "혼돈의 왕좌": 2, "얼어붙은 성채": 1, "폭풍 첨탑": 1, "그림자 심연": 2, "독버섯 늪": 3, "이끼 낀 지하묘지": 3, "타락한 성역": 0, "태엽 공장": 1, "고블린 굴": 0 };
const CRYSTAL_COL = ["#ffa040", "#6ad8ff", "#d070ff", "#8aff6a"];
const FLASK = { flask_big_red: "#ff5050", flask_big_blue: "#5090ff", flask_big_green: "#60ff80", flask_big_yellow: "#ffe060" };

function shadow(ctx, x, y, rx, ry, a = 0.3) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }

/** 그렸으면 true */
export function drawDungeonObject(ctx, o, x, y, t) {
  switch (o.kind) {
    case "column": {
      shadow(ctx, x, y - 2, 18, 5, 0.35);
      drawFoot(ctx, "coulmn_base", x, y);
      drawFoot(ctx, "column_mid", x, y - 32);
      drawFoot(ctx, "column_top", x, y - 64);
      return true;
    }
    case "wfount": {
      const c = o.c === "red" ? "red" : "blue";
      drawFoot(ctx, "wall_fountain_top", x, y - 32);
      drawFoot(ctx, animName(`wall_fountain_mid_${c}_anim`, t, 6), x, y);
      drawFoot(ctx, animName(`wall_fountain_basin_${c}_anim`, t, 6), x, y + 32);
      addGlow(o.x, o.y + 10, 110, c === "red" ? "#ff6a2a" : "#3a9aff", 0.45 + Math.sin(t * 3) * 0.05, o);
      return true;
    }
    case "circle": {
      // 바닥 룬 마법진: 바깥 고리 + 천천히 도는 룬 + 안쪽 별
      const col = o.c ?? "#8a6aff", R = 74, k = 0.55, a = t * 0.25;
      const pulse = 0.55 + Math.sin(t * 1.6) * 0.15;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, R, R * k, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y, R - 9, (R - 9) * k, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y, R * 0.45, R * 0.45 * k, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      for (let i = 0; i < 16; i++) {
        const q = a + (i / 16) * Math.PI * 2;
        const rx = x + Math.cos(q) * (R - 4.5), ry = y + Math.sin(q) * (R - 4.5) * k;
        ctx.fillRect(Math.round(rx) - (i % 2 ? 1 : 2), Math.round(ry) - 1, i % 2 ? 2 : 4, 3);
      }
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) { const q = -a * 1.5 + (i * 2 * Math.PI * 2) / 5; const px = x + Math.cos(q) * R * 0.62, py = y + Math.sin(q) * R * 0.62 * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      ctx.restore();
      addGlow(o.x, o.y, 120, col, 0.28 * pulse, o);
      return true;
    }
    case "crystal": {
      const v = CRYSTAL[G.zone?.name] ?? (o.v % 4);
      const c = frame("t:crystal" + v);
      if (!c) return true;
      shadow(ctx, x, y - 1, 12, 3, 0.35);
      const w = c.width * 2.2, h = c.height * 2.2;
      ctx.save(); ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1);
      ctx.drawImage(c, Math.round(-w / 2), Math.round(-h), w, h);
      ctx.restore();
      const tw = 0.75 + Math.sin(t * 2.3 + o.x) * 0.25;
      // 반짝임
      if (Math.sin(t * 5 + o.y) > 0.92) { ctx.fillStyle = "#fff"; ctx.fillRect(x - 3, y - 26, 2, 2); }
      addGlow(o.x, o.y - 14, 85, CRYSTAL_COL[v], 0.5 * tw, o);
      return true;
    }
    case "dprop": {
      const name = o.s === "chest" ? "chest_full_open_anim_f0" : o.s;
      shadow(ctx, x, y - 1, 12, 3, 0.3);
      drawFoot(ctx, name, x, y);
      if (FLASK[o.s]) addGlow(o.x, o.y - 14, 40, FLASK[o.s], 0.35 + Math.sin(t * 3 + o.x) * 0.1, o);
      return true;
    }
    case "floorfx": return drawFloorFx(ctx, o, x, y, t);
    case "chest": {
      const open = G.chestOpened?.has(o.id);
      shadow(ctx, x, y - 1, 16, 4, 0.4);
      if (!open) {
        const p = 0.6 + Math.sin(t * 3) * 0.25;
        addGlow(o.x, o.y - 12, 70, "#ffd35a", 0.45 * p);
        if (Math.sin(t * 5) > 0.7) { ctx.fillStyle = "#fff6c0"; ctx.fillRect(x + 8, y - 30, 2, 2); }
      }
      const c = frame(open ? "chest_full_open_anim_f2" : "chest_full_open_anim_f0");
      if (c) ctx.drawImage(c, Math.round(x - 16), Math.round(y - 30), 32, 32);
      if (!open) {
        ctx.font = "10px Galmuri9"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(o.label ?? "보상 상자", x, y - 40);
        ctx.fillStyle = "#ffe08a"; ctx.fillText(o.label ?? "보상 상자", x, y - 40);
      }
      return true;
    }
    case "spikes": {
      const st = G.spikes?.[o.phase] ?? 0;
      let f = 0;
      if (st === 1) f = Math.sin(t * 30) > 0 ? 1 : 0;
      else if (st === 2) f = 3;
      drawFoot(ctx, `floor_spikes_anim_f${f}`, x, y);
      if (st === 1) { ctx.strokeStyle = `rgba(255,70,50,${0.5 + Math.sin(t * 30) * 0.3})`; ctx.lineWidth = 1; ctx.strokeRect(x - 15.5, y - 31.5, 31, 31); }
      return true;
    }
  }
  return false;
}

function drawFloorFx(ctx, o, x, y, t) {
  const v = o.v ?? 0;
  const rnd = (k) => { const s = Math.sin(v * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  switch (o.t) {
    case "lava": {
      // 빛나는 용암 균열
      const glow = 0.7 + Math.sin(t * 2 + v) * 0.3;
      ctx.strokeStyle = "#2a0800"; ctx.lineWidth = 3;
      const pts = []; let px = x - 14, py = y + (rnd(1) - 0.5) * 8;
      for (let i = 0; i < 6; i++) { pts.push([px, py]); px += 5 + rnd(i + 2) * 3; py += (rnd(i + 9) - 0.5) * 8; }
      const path = () => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); };
      path(); ctx.stroke();
      ctx.strokeStyle = `rgba(255,${120 + glow * 80},40,${0.85 * glow})`; ctx.lineWidth = 1.5; path(); ctx.stroke();
      addGlow(o.x, o.y, 46, "#ff7a2a", 0.35 * glow, o);
      return true;
    }
    case "frost": {
      ctx.fillStyle = "rgba(200,235,255,0.22)"; ctx.beginPath(); ctx.ellipse(x, y, 18, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(230,248,255,0.7)";
      for (let i = 0; i < 7; i++) ctx.fillRect(Math.round(x + (rnd(i) - 0.5) * 30), Math.round(y + (rnd(i + 7) - 0.5) * 14), 2, 1);
      if (Math.sin(t * 4 + v) > 0.95) { ctx.fillStyle = "#fff"; ctx.fillRect(x + 4, y - 2, 1, 3); ctx.fillRect(x + 3, y - 1, 3, 1); }
      return true;
    }
    case "acid": {
      ctx.fillStyle = "rgba(60,140,20,0.55)"; ctx.beginPath(); ctx.ellipse(x, y, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(140,230,60,0.55)"; ctx.beginPath(); ctx.ellipse(x - 2, y - 1, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
      const b = (t * 0.8 + rnd(3)) % 1;
      ctx.fillStyle = `rgba(200,255,140,${1 - b})`; ctx.fillRect(Math.round(x - 6 + rnd(4) * 12), Math.round(y - b * 6), 2, 2);
      addGlow(o.x, o.y, 40, "#8aff3a", 0.22, o);
      return true;
    }
    case "moss": {
      for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 3 ? "rgba(90,140,60,0.6)" : "rgba(130,180,80,0.6)"; ctx.fillRect(Math.round(x + (rnd(i) - 0.5) * 26), Math.round(y + (rnd(i + 11) - 0.5) * 12), 2, 1); }
      if (rnd(30) > 0.6) { ctx.fillStyle = "#d8c070"; ctx.fillRect(x + 6, y - 3, 2, 2); ctx.fillStyle = "#6a9a40"; ctx.fillRect(x + 6, y - 1, 2, 2); }
      return true;
    }
    case "void": {
      const a = 0.18 + Math.sin(t * 1.4 + v) * 0.08;
      ctx.fillStyle = `rgba(120,60,200,${a})`; ctx.beginPath(); ctx.ellipse(x, y, 20, 8, Math.sin(t * 0.5 + v) * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(200,150,255,${a + 0.2})`; ctx.fillRect(Math.round(x + Math.cos(t + v) * 10), Math.round(y + Math.sin(t + v) * 4), 2, 2);
      addGlow(o.x, o.y, 40, "#a050ff", 0.2, o);
      return true;
    }
    case "spark": {
      if (Math.sin(t * 9 + v * 3) > 0.6) {
        ctx.strokeStyle = "rgba(180,220,255,0.9)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 2, y - 3); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x + 6, y - 2); ctx.stroke();
        addGlow(o.x, o.y, 34, "#8ac8ff", 0.35);
      }
      ctx.fillStyle = "rgba(40,50,80,0.4)"; ctx.fillRect(x - 8, y + 1, 16, 1);
      return true;
    }
    case "holy": {
      const a = 0.5 + Math.sin(t * 2 + v) * 0.3;
      ctx.fillStyle = `rgba(255,230,140,${a})`;
      for (let i = 0; i < 4; i++) { const q = t * 0.6 + i * Math.PI / 2 + v; ctx.fillRect(Math.round(x + Math.cos(q) * 9), Math.round(y + Math.sin(q) * 4), 2, 2); }
      addGlow(o.x, o.y, 36, "#ffe08a", 0.22 * a, o);
      return true;
    }
    case "gear": {
      ctx.fillStyle = "rgba(40,36,30,0.55)"; ctx.fillRect(x - 12, y - 6, 24, 12);
      ctx.fillStyle = "rgba(150,130,90,0.5)"; ctx.fillRect(x - 11, y - 5, 22, 1);
      ctx.fillStyle = "#c8b080"; for (const [a, b] of [[-9, -3], [8, -3], [-9, 3], [8, 3]]) ctx.fillRect(x + a, y + b, 2, 2);
      return true;
    }
  }
  return true;
}
