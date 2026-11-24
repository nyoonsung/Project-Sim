// 배경음악 데이터 검사: 모든 던전 구역에 전용 곡이 있고, 곡 설정(음계·악기·북 패턴)이 올바른지
import assert from "node:assert/strict";
import { THEMES, themeForZone, NOTE_INSTS } from "../public/js/music.js";
import { DUNGEONS } from "../shared/zones.js";

const MODES = ["ion", "dor", "phr", "lyd", "mix", "aeo", "harm", "phrd"];
const DRUMS = ["kick", "snare", "hat", "shaker", "taiko", "tom", "tick", "clap", "rim"];
const AMB = ["waves", "wind", "drips", "sparkle", "embers", "bubbles", "thunder", "whisper", "birds", "toll", "gears", "heartbeat"];
for (const [k, th] of Object.entries(THEMES)) {
  assert.ok(th.name && th.bpm >= 50 && th.bpm <= 170, `${k} 이름·빠르기`);
  assert.ok(MODES.includes(th.mode), `${k} 음계 ${th.mode}`);
  assert.ok(th.prog.length >= 2 && th.prog.every((d) => d >= 0 && d < 7), `${k} 화음 진행`);
  for (const L of ["arp", "lead", "pad"]) if (th[L]) assert.ok(NOTE_INSTS.includes(th[L].inst), `${k}.${L} 악기 ${th[L].inst}`);
  if (th.arp) assert.ok(th.arp.pat.split(" ").every((x) => x === "." || /^\d$/.test(x)) && [8, 16].includes(th.arp.rate), `${k} 분산화음 패턴`);
  if (th.bass) assert.ok(["hold", "pulse", "drive", "gallop", "walk"].includes(th.bass.pat), `${k} 베이스 ${th.bass.pat}`);
  if (th.drums) for (const [d, pat] of Object.entries(th.drums)) if (d !== "vol") { assert.ok(DRUMS.includes(d), `${k} 북 ${d}`); assert.equal(pat.length, 16, `${k}.${d} 16칸`); }
  if (th.amb) assert.ok(AMB.includes(th.amb.kind), `${k} 환경음 ${th.amb.kind}`);
}
// 모든 구역 이름이 기본값(crypt)으로 빠지지 않고 어울리는 곡으로 연결
const fallbackOk = /지하묘지|왕릉|회랑/;
for (const D of Object.values(DUNGEONS)) if (D.id !== 5) for (const z of D.zones) { // 성좌의 시련은 전용 곡(astra_trial)
  const t = themeForZone(z.name);
  assert.ok(THEMES[t], `${z.name} → ${t}`);
  if (t === "crypt") assert.ok(fallbackOk.test(z.name), `${z.name}: 전용 곡이 없음`);
}
for (const k of ["title", "town_erden", "town_verdan", "town_astra", "safe", "pvp", "miniboss", "boss", "boss_final", "boss_astra", "astra_trial"]) assert.ok(THEMES[k], k);
console.log(`MUSIC TESTS: ALL PASS (${Object.keys(THEMES).length}곡)`);
