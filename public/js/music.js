// 배경음악: 섬·던전·구역마다 분위기에 맞는 곡을 실시간으로 연주 (음원 파일 없이 합성)
//  · 곡 = 음계·화음 진행·빠르기 + 층(화음 패드, 분산화음, 선율, 베이스, 북, 환경음)
//  · 선율은 곡마다 정해진 씨앗으로 만든 동기(모티프)를 반복·변형해서, 같은 곳에선 늘 같은 곡이 흐름
//  · 구간(A·B·잔잔한 C)을 돌며 층을 켜고 꺼서 지루하지 않게, 장면이 바뀌면 부드럽게 넘어감
import { AU, V, onAudio, panner, gainN, mtof } from "./audio.js";

const MODE = {
  ion: [0, 2, 4, 5, 7, 9, 11], dor: [0, 2, 3, 5, 7, 9, 10], phr: [0, 1, 3, 5, 7, 8, 10], lyd: [0, 2, 4, 6, 7, 9, 11],
  mix: [0, 2, 4, 5, 7, 9, 10], aeo: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], phrd: [0, 1, 4, 5, 7, 8, 10],
};
// 2마디(32칸, 16분음표) 리듬 틀: [시작 칸, 길이]
const RHY = {
  calm: [[[0, 6], [6, 2], [8, 8], [16, 4], [20, 4], [24, 8]], [[0, 8], [8, 4], [12, 4], [16, 12], [28, 4]], [[0, 4], [4, 4], [8, 8], [18, 6], [24, 8]]],
  flow: [[[0, 4], [4, 2], [6, 2], [8, 4], [12, 4], [16, 6], [22, 2], [24, 8]], [[0, 2], [2, 2], [4, 4], [8, 6], [14, 2], [16, 4], [20, 4], [24, 8]], [[0, 3], [3, 3], [6, 2], [8, 8], [16, 3], [19, 3], [22, 2], [24, 8]]],
  drive: [[[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4], [16, 3], [19, 3], [22, 2], [24, 4], [28, 4]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 4], [16, 2], [18, 2], [20, 4], [24, 8]], [[0, 4], [4, 2], [6, 2], [8, 3], [11, 3], [14, 2], [16, 6], [22, 2], [24, 4], [28, 4]]],
  sparse: [[[0, 12], [12, 4], [16, 16]], [[0, 8], [8, 8], [16, 6], [22, 10]], [[2, 10], [12, 4], [16, 16]]],
};
const D = (s) => s; // 북 패턴 표기 (x 강, o 약, . 쉼)

// ── 곡 목록 ──────────────────────────────────────────────
// root: 으뜸음(MIDI), prog: 화음(음계 도수, 0부터) · bpc: 화음 하나당 마디 수
// arp/lead/pad/bass: inst(악기)·vol·oct(옥타브) 등, drums: 악기별 16칸 패턴, amb: 환경음
export const THEMES = {
  title: { name: "심연으로", bpm: 78, root: 50, mode: "aeo", prog: [0, 5, 2, 6], bpc: 2, verb: 0.5, delay: 0.22,
    pad: { inst: "pad", vol: 0.5, cutoff: 1300 }, arp: { inst: "harp", vol: 0.32, pat: "0 1 2 3 2 1 2 1", rate: 8, oct: 0 },
    lead: { inst: "flute", vol: 0.3, style: "calm", oct: 1 }, bass: { pat: "hold", vol: 0.42 }, choir: { vol: 0.2 },
    drums: { vol: 0.5, taiko: D("x...............") }, amb: { kind: "wind", p: 0.4 } },
  town_erden: { name: "에르덴 항구", bpm: 96, root: 53, mode: "ion", prog: [0, 4, 5, 3], bpc: 2, verb: 0.35, delay: 0.18, swing: 0.12,
    pad: { inst: "pad", vol: 0.35, wave: "triangle", cutoff: 2200 }, arp: { inst: "pluck", vol: 0.32, pat: "0 1 2 1 3 2 1 2", rate: 8, oct: 0 },
    lead: { inst: "flute", vol: 0.34, style: "flow", oct: 1 }, bass: { pat: "walk", vol: 0.48 },
    drums: { vol: 0.5, kick: D("x.......x......."), shaker: D("..x...x...x...x."), rim: D("....x.......x...") }, amb: { kind: "waves", p: 0.5 } },
  town_verdan: { name: "베르단의 숲 마을", bpm: 84, root: 50, mode: "dor", prog: [0, 3, 0, 6], bpc: 2, verb: 0.45, delay: 0.25, swing: 0.1,
    pad: { inst: "pad", vol: 0.32, wave: "triangle", cutoff: 1800 }, arp: { inst: "harp", vol: 0.34, pat: "0 2 1 3 2 1 0 1", rate: 8, oct: 0 },
    lead: { inst: "flute", vol: 0.32, style: "calm", oct: 1 }, bass: { pat: "hold", vol: 0.42 },
    drums: { vol: 0.42, kick: D("x.....x...x....."), shaker: D("x.x.x.x.x.x.x.x.") }, amb: { kind: "birds", p: 0.6 } },
  town_astra: { name: "별빛의 섬 아스트라엘", bpm: 70, root: 51, mode: "lyd", prog: [0, 1, 5, 4], bpc: 2, verb: 0.62, delay: 0.35,
    pad: { inst: "pad", vol: 0.42, cutoff: 1700, attack: 1.4 }, arp: { inst: "bell", vol: 0.16, pat: "0 1 2 3 4 3 2 1", rate: 16, oct: 1 },
    lead: { inst: "bell", vol: 0.2, style: "sparse", oct: 1 }, bass: { pat: "hold", vol: 0.36 }, choir: { vol: 0.16 },
    amb: { kind: "sparkle", p: 0.8 } },
  safe: { name: "모닥불 쉼터", bpm: 72, root: 55, mode: "ion", prog: [0, 5, 3, 4], bpc: 2, verb: 0.45, delay: 0.25,
    pad: { inst: "pad", vol: 0.32, wave: "triangle", cutoff: 1600 }, arp: { inst: "harp", vol: 0.34, pat: "0 1 2 3 2 1", rate: 8, oct: 0 },
    lead: { inst: "flute", vol: 0.24, style: "calm", oct: 1 }, bass: { pat: "hold", vol: 0.36 }, amb: { kind: "embers", p: 0.6 } },
  crypt: { name: "잠든 묘지", bpm: 76, root: 45, mode: "harm", prog: [0, 5, 3, 4], bpc: 2, verb: 0.58, delay: 0.2,
    pad: { inst: "choir", vol: 0.32 }, arp: { inst: "pluck", vol: 0.28, pat: "0 . 2 . 1 . . 3", rate: 8, oct: 1 },
    lead: { inst: "flute", vol: 0.26, style: "sparse", oct: 1 }, bass: { pat: "hold", vol: 0.42 },
    drums: { vol: 0.45, kick: D("x..............."), tom: D("........x.......") }, amb: { kind: "drips", p: 0.7 } },
  cave: { name: "고블린의 굴", bpm: 112, root: 47, mode: "aeo", prog: [0, 0, 5, 6], bpc: 1, verb: 0.3, delay: 0.12,
    pad: { inst: "pad", vol: 0.22, cutoff: 1100 }, arp: { inst: "marimba", vol: 0.42, pat: "0 . 1 2 . 1 0 .", rate: 8, oct: 1 },
    lead: { inst: "pluck", vol: 0.3, style: "drive", oct: 1 }, bass: { pat: "gallop", vol: 0.46, wave: "saw" },
    drums: { vol: 0.58, kick: D("x..x..x.x..x..x."), tom: D("....x.......x.x."), shaker: D("xxxxxxxxxxxxxxxx") }, amb: { kind: "drips", p: 0.4 }, fill: true },
  swamp: { name: "독안개 늪", bpm: 92, root: 48, mode: "dor", prog: [0, 3, 0, 4], bpc: 2, verb: 0.42, delay: 0.25, swing: 0.18,
    pad: { inst: "pad", vol: 0.28, wave: "triangle", cutoff: 1300 }, arp: { inst: "marimba", vol: 0.4, pat: "0 2 1 2 3 2 1 2", rate: 8, oct: 1 },
    lead: { inst: "flute", vol: 0.26, style: "flow", oct: 1 }, bass: { pat: "walk", vol: 0.45 },
    drums: { vol: 0.48, kick: D("x.....x.....x..."), shaker: D("..x...x...x...x."), rim: D("......x.......x.") }, amb: { kind: "bubbles", p: 0.6 } },
  fire: { name: "용광로의 고동", bpm: 124, root: 45, mode: "phrd", prog: [0, 1, 0, 6], bpc: 2, verb: 0.3, delay: 0.1,
    pad: { inst: "pad", vol: 0.28, cutoff: 1000 }, arp: { inst: "pluck", vol: 0.32, pat: "0 0 1 0 2 0 1 0", rate: 16, oct: 0, wave: "sawtooth" },
    lead: { inst: "brass", vol: 0.32, style: "drive", oct: 1 }, bass: { pat: "drive", vol: 0.5, wave: "saw" },
    drums: { vol: 0.62, taiko: D("x.....x...x....."), kick: D("x...x...x...x..."), snare: D("....x.......x..."), hat: D("x.x.x.x.x.x.x.x.") }, amb: { kind: "embers", p: 0.6 }, fill: true, crash: true },
  ice: { name: "얼어붙은 성채", bpm: 74, root: 52, mode: "aeo", prog: [0, 5, 2, 6], bpc: 2, verb: 0.66, delay: 0.32,
    pad: { inst: "pad", vol: 0.34, wave: "triangle", cutoff: 2600, attack: 1.2 }, arp: { inst: "bell", vol: 0.18, pat: "0 2 4 2 3 1", rate: 8, oct: 1 },
    lead: { inst: "flute", vol: 0.28, style: "calm", oct: 1 }, bass: { pat: "hold", vol: 0.38 },
    drums: { vol: 0.36, kick: D("x..............."), hat: D("........x.......") }, amb: { kind: "wind", p: 0.7 } },
  storm: { name: "폭풍의 첨탑", bpm: 136, root: 50, mode: "aeo", prog: [0, 5, 6, 4], bpc: 2, verb: 0.32, delay: 0.15,
    pad: { inst: "pad", vol: 0.25, cutoff: 1500 }, arp: { inst: "pluck", vol: 0.3, pat: "0 1 2 1 0 1 2 3", rate: 16, oct: 0 },
    lead: { inst: "brass", vol: 0.3, style: "drive", oct: 1 }, bass: { pat: "drive", vol: 0.48, wave: "saw" },
    drums: { vol: 0.6, kick: D("x.....x.x......."), snare: D("....x.......x..."), hat: D("xxxxxxxxxxxxxxxx") }, amb: { kind: "thunder", p: 0.25 }, fill: true, crash: true },
  holy: { name: "타락한 성역", bpm: 80, root: 50, mode: "aeo", prog: [0, 3, 5, 4], bpc: 2, verb: 0.62, delay: 0.2,
    pad: { inst: "choir", vol: 0.32 }, arp: { inst: "harp", vol: 0.3, pat: "0 1 2 3 4 3 2 1", rate: 8, oct: 0 },
    lead: { inst: "bell", vol: 0.2, style: "sparse", oct: 1 }, bass: { pat: "hold", vol: 0.4 },
    drums: { vol: 0.42, kick: D("x.......x......."), taiko: D("x...............") }, amb: { kind: "toll", p: 0.35 } },
  clock: { name: "태엽 장치의 박동", bpm: 116, root: 49, mode: "harm", prog: [0, 5, 3, 4], bpc: 1, verb: 0.3, delay: 0.2,
    pad: { inst: "pad", vol: 0.22, cutoff: 1300 }, arp: { inst: "marimba", vol: 0.38, pat: "0 2 1 2 0 2 1 2", rate: 16, oct: 1 },
    lead: { inst: "pluck", vol: 0.28, style: "flow", oct: 1 }, bass: { pat: "pulse", vol: 0.44 },
    drums: { vol: 0.55, tick: D("x.x.x.x.x.x.x.x."), kick: D("x.......x......."), snare: D("....x.......x...") }, amb: { kind: "gears", p: 0.5 } },
  void: { name: "별 없는 심연", bpm: 66, root: 44, mode: "phr", prog: [0, 1, 0, 5], bpc: 2, verb: 0.72, delay: 0.3,
    pad: { inst: "choir", vol: 0.3, vowel: "o" }, drone: { vol: 0.3 }, arp: { inst: "bell", vol: 0.13, pat: "0 . . 2 . . 1 .", rate: 8, oct: 1 },
    lead: { inst: "flute", vol: 0.22, style: "sparse", oct: 0 }, bass: { pat: "hold", vol: 0.4 },
    drums: { vol: 0.5, kick: D("x..x............"), }, amb: { kind: "whisper", p: 0.6 } },
  throne: { name: "혼돈의 왕좌", bpm: 104, root: 50, mode: "harm", prog: [0, 5, 3, 4], bpc: 2, verb: 0.45, delay: 0.15,
    pad: { inst: "pad", vol: 0.32, cutoff: 1800 }, arp: { inst: "pluck", vol: 0.28, pat: "0 1 2 1 0 1 2 1", rate: 8, oct: 0 }, choir: { vol: 0.18 },
    lead: { inst: "brass", vol: 0.32, style: "flow", oct: 1 }, bass: { pat: "pulse", vol: 0.46 },
    drums: { vol: 0.56, taiko: D("x.......x......."), snare: D("....x.x.....x..x"), kick: D("x...x...x...x...") }, fill: true, crash: true },
  ocean: { name: "가라앉은 항구", bpm: 82, root: 46, mode: "dor", prog: [0, 6, 3, 0], bpc: 2, verb: 0.55, delay: 0.38,
    pad: { inst: "pad", vol: 0.32, wave: "triangle", cutoff: 1500, attack: 1 }, arp: { inst: "harp", vol: 0.32, pat: "0 2 4 2 3 1", rate: 8, oct: 1 },
    lead: { inst: "flute", vol: 0.26, style: "calm", oct: 1 }, bass: { pat: "hold", vol: 0.4 },
    drums: { vol: 0.38, kick: D("x.......x..x...."), shaker: D("....x.......x...") }, amb: { kind: "bubbles", p: 0.6 } },
  desert: { name: "유리 사막", bpm: 100, root: 52, mode: "phrd", prog: [0, 1, 3, 1], bpc: 2, verb: 0.4, delay: 0.25,
    pad: { inst: "pad", vol: 0.24, cutoff: 1400 }, arp: { inst: "pluck", vol: 0.34, pat: "0 1 0 2 0 1 3 1", rate: 16, oct: 0, decay: 0.3 },
    lead: { inst: "flute", vol: 0.3, style: "flow", oct: 1 }, bass: { pat: "pulse", vol: 0.42 },
    drums: { vol: 0.5, kick: D("x..x..x.x......."), tom: D("x.....x...x....."), rim: D("..x...x...x.x.x.") }, amb: { kind: "wind", p: 0.5 } },
  frontier: { name: "침식된 변경", bpm: 100, root: 47, mode: "aeo", prog: [0, 6, 5, 4], bpc: 2, verb: 0.38, delay: 0.18,
    pad: { inst: "pad", vol: 0.28, cutoff: 1300 }, arp: { inst: "pluck", vol: 0.3, pat: "0 1 2 0 1 2 1 0", rate: 8, oct: 0 },
    lead: { inst: "flute", vol: 0.28, style: "flow", oct: 1 }, bass: { pat: "pulse", vol: 0.44 },
    drums: { vol: 0.5, kick: D("x.....x.x......."), snare: D("....x.......x..."), shaker: D("x.x.x.x.x.x.x.x.") }, amb: { kind: "wind", p: 0.4 } },
  forest: { name: "잠든 원시림", bpm: 88, root: 50, mode: "dor", prog: [0, 3, 6, 3], bpc: 2, verb: 0.5, delay: 0.28, swing: 0.12,
    pad: { inst: "pad", vol: 0.3, wave: "triangle", cutoff: 1500 }, arp: { inst: "marimba", vol: 0.38, pat: "0 2 1 3 2 1 0 2", rate: 8, oct: 1 },
    lead: { inst: "flute", vol: 0.28, style: "calm", oct: 1 }, bass: { pat: "walk", vol: 0.4 },
    drums: { vol: 0.42, kick: D("x.....x...x....."), shaker: D("..x...x...x...x."), tom: D("..........x.....") }, amb: { kind: "birds", p: 0.5 } },
  observatory: { name: "봉인된 천문대", bpm: 90, root: 50, mode: "lyd", prog: [0, 1, 4, 5], bpc: 2, verb: 0.55, delay: 0.3,
    pad: { inst: "pad", vol: 0.32, cutoff: 1700 }, arp: { inst: "bell", vol: 0.16, pat: "0 1 2 3 2 1 2 4", rate: 16, oct: 1 },
    lead: { inst: "flute", vol: 0.26, style: "flow", oct: 1 }, bass: { pat: "hold", vol: 0.4 },
    drums: { vol: 0.4, kick: D("x.......x......."), hat: D("..x...x...x...x.") }, amb: { kind: "sparkle", p: 0.5 } },
  heart: { name: "섬의 심장", bpm: 120, root: 46, mode: "harm", prog: [0, 5, 1, 4], bpc: 2, verb: 0.42, delay: 0.15,
    pad: { inst: "choir", vol: 0.28 }, arp: { inst: "pluck", vol: 0.3, pat: "0 1 2 1 0 1 2 1", rate: 16, oct: 0 },
    lead: { inst: "brass", vol: 0.32, style: "drive", oct: 1 }, bass: { pat: "drive", vol: 0.5, wave: "saw" },
    drums: { vol: 0.6, kick: D("x.......x.x....."), taiko: D("x.....x...x....."), snare: D("....x.......x...") }, amb: { kind: "heartbeat", p: 1 }, fill: true, crash: true },
  astra_trial: { name: "성좌의 시련", bpm: 108, root: 49, mode: "aeo", prog: [0, 5, 2, 6], bpc: 2, verb: 0.5, delay: 0.25,
    pad: { inst: "pad", vol: 0.34, cutoff: 2000 }, arp: { inst: "bell", vol: 0.15, pat: "0 1 2 3 4 3 2 1", rate: 16, oct: 1 }, choir: { vol: 0.14 },
    lead: { inst: "brass", vol: 0.28, style: "flow", oct: 1 }, bass: { pat: "pulse", vol: 0.44 },
    drums: { vol: 0.52, kick: D("x.....x.x......."), snare: D("....x.......x..."), hat: D("x.x.x.x.x.x.x.x."), taiko: D("x...............") }, amb: { kind: "sparkle", p: 0.5 }, fill: true, crash: true },
  miniboss: { name: "강적 출현", bpm: 128, root: 47, mode: "harm", prog: [0, 5, 3, 4], bpc: 1, verb: 0.35, delay: 0.1, intense: true,
    pad: { inst: "pad", vol: 0.3, cutoff: 1500 }, arp: { inst: "pluck", vol: 0.3, pat: "0 1 2 1 0 1 2 1", rate: 16, oct: 0 },
    lead: { inst: "brass", vol: 0.32, style: "drive", oct: 1 }, bass: { pat: "drive", vol: 0.5, wave: "saw" },
    drums: { vol: 0.62, kick: D("x...x...x...x..."), snare: D("....x.......x..."), hat: D("x.x.x.x.x.x.x.x."), taiko: D("x.......x.......") }, fill: true, crash: true },
  boss: { name: "보스: 심연의 군주", bpm: 142, root: 45, mode: "harm", prog: [0, 0, 5, 4], bpc: 1, verb: 0.38, delay: 0.1, intense: true,
    pad: { inst: "pad", vol: 0.34, cutoff: 1800 }, arp: { inst: "pluck", vol: 0.32, pat: "0 1 2 1 0 1 2 3", rate: 16, oct: 0, wave: "sawtooth" }, choir: { vol: 0.2 },
    lead: { inst: "brass", vol: 0.36, style: "drive", oct: 1 }, bass: { pat: "drive", vol: 0.52, wave: "saw" },
    drums: { vol: 0.66, kick: D("x.x...x.x.x...x."), snare: D("....x.......x..."), hat: D("xxxxxxxxxxxxxxxx"), taiko: D("x.......x.......") }, fill: true, crash: true },
  boss_final: { name: "최후의 결전", bpm: 150, root: 43, mode: "phr", prog: [0, 1, 5, 6], bpc: 1, verb: 0.45, delay: 0.1, intense: true,
    pad: { inst: "choir", vol: 0.34 }, arp: { inst: "pluck", vol: 0.32, pat: "0 0 1 0 2 0 1 3", rate: 16, oct: 0, wave: "sawtooth" }, drone: { vol: 0.22 },
    lead: { inst: "brass", vol: 0.38, style: "drive", oct: 1 }, bass: { pat: "drive", vol: 0.55, wave: "saw" },
    drums: { vol: 0.7, kick: D("x.x.x.x.x.x.x.x."), snare: D("....x.......x..x"), hat: D("xxxxxxxxxxxxxxxx"), taiko: D("x.....x...x.....") }, fill: true, crash: true },
  boss_astra: { name: "수호성의 노래", bpm: 132, root: 51, mode: "aeo", prog: [0, 5, 2, 6], bpc: 1, verb: 0.5, delay: 0.2, intense: true,
    pad: { inst: "pad", vol: 0.34, cutoff: 2200 }, arp: { inst: "bell", vol: 0.16, pat: "0 1 2 3 4 3 2 1", rate: 16, oct: 1 }, choir: { vol: 0.22 },
    lead: { inst: "brass", vol: 0.34, style: "drive", oct: 1 }, bass: { pat: "drive", vol: 0.5, wave: "saw" },
    drums: { vol: 0.64, kick: D("x...x...x...x..."), snare: D("....x.......x..."), hat: D("x.x.x.x.x.x.x.x."), taiko: D("x.....x...x.....") }, fill: true, crash: true },
  pvp: { name: "결투장", bpm: 128, root: 52, mode: "dor", prog: [0, 6, 5, 6], bpc: 1, verb: 0.3, delay: 0.15, intense: true,
    pad: { inst: "pad", vol: 0.26, cutoff: 1600 }, arp: { inst: "pluck", vol: 0.3, pat: "0 1 2 1 3 2 1 2", rate: 16, oct: 0 },
    lead: { inst: "brass", vol: 0.3, style: "drive", oct: 1 }, bass: { pat: "drive", vol: 0.5, wave: "saw" },
    drums: { vol: 0.62, kick: D("x.....x.x.....x."), snare: D("....x.......x..."), hat: D("x.x.x.x.x.x.x.x."), clap: D("....x.......x...") }, fill: true, crash: true },
};
// 곡마다 체감 음량 맞춤 (오프라인 렌더 RMS 기준, 마을은 조금 더 잔잔하게)
const NORM = { title: 0.81, town_erden: 0.82, town_verdan: 0.8, town_astra: 0.95, safe: 0.92, crypt: 0.99, cave: 1.2, swamp: 0.97, fire: 1.0, ice: 0.9, storm: 1.09, holy: 1.09, clock: 1.35, void: 0.97, throne: 1.15, ocean: 0.89, desert: 1.09, frontier: 1.09, forest: 0.97, observatory: 0.99, heart: 0.98, astra_trial: 1.19, miniboss: 1.0, boss: 0.95, boss_final: 0.87, boss_astra: 0.92, pvp: 1.03 };
// 구역 이름 → 곡
const ZONE_MAP = [
  [/지하묘지|왕릉|회랑/, "crypt"], [/고블린/, "cave"], [/늪/, "swamp"], [/용광로/, "fire"], [/심장/, "heart"],
  [/얼어|설원|서리/, "ice"], [/폭풍/, "storm"], [/성역/, "holy"], [/태엽|시계/, "clock"],
  [/심연|균열/, "void"], [/왕좌|궁정/, "throne"], [/항구|해저/, "ocean"], [/사막/, "desert"],
  [/변경/, "frontier"], [/원시림/, "forest"], [/천문대/, "observatory"],
];
export function themeForZone(name = "") { for (const [re, k] of ZONE_MAP) if (re.test(name)) return k; return "crypt"; }

// ── 곡 만들기 (씨앗 고정 난수)
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function motif(r, style) {
  const set = RHY[style] ?? RHY.flow, rh = set[Math.floor(r() * set.length)];
  let d = [0, 2, 4][Math.floor(r() * 3)];
  return rh.map(([s, len]) => {
    const n = { s, len, d };
    const x = r(), st = x < 0.34 ? 1 : x < 0.68 ? -1 : x < 0.8 ? 2 : x < 0.9 ? -2 : x < 0.95 ? 3 : -3;
    d = Math.max(-2, Math.min(7, d + st));
    return n;
  });
}
function compile(key) {
  const th = THEMES[key], r = rng(hash(key));
  const mode = MODE[th.mode] ?? MODE.aeo;
  const m1 = motif(r, th.lead?.style), m2 = motif(r, th.lead?.style);
  // 맺음 동기: 첫 동기에서 마지막 음을 으뜸음으로 길게
  const end = m1.map((n, i) => (i === m1.length - 1 ? { ...n, abs: 0, len: Math.max(n.len, 32 - n.s) } : { ...n }));
  const m1b = m1.map((n, i) => (i >= m1.length - 2 ? { ...n, d: n.d + (r() < 0.5 ? 2 : -1) } : n));
  // 음역: 곡의 으뜸음 높이와 상관없이 악기마다 듣기 좋은 높이로 (휴대폰 스피커에서도 들리게)
  const near = (target) => th.root + 12 * Math.round((target - th.root) / 12);
  const leadBase = near({ brass: 60, flute: 67, bell: 72, pluck: 64 }[th.lead?.inst] ?? 64);
  const arpBase = near({ bell: 72, marimba: 64, harp: 60, pluck: 57 }[th.arp?.inst] ?? 60);
  return { key, th, mode, motifs: [m1, m1b, m2, end], cycle: th.prog.length * (th.bpc ?? 1), leadBase, arpBase };
}
const deg2m = (S, d) => S.th.root + S.mode[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const chordTones = (c) => [c, c + 2, c + 4];
function snapChord(d, c) {
  const set = chordTones(c).map((x) => ((x % 7) + 7) % 7);
  for (const k of [0, 1, -1, 2, -2]) if (set.includes((((d + k) % 7) + 7) % 7)) return d + k;
  return d;
}
/** 음을 지정 범위 안으로 옥타브 이동 */
function fold(m, lo, hi) { while (m < lo) m += 12; while (m > hi) m -= 12; return m; }

// ── 연주 ────────────────────────────────────────────────
function makeChannels(S, ctx, b) {
  const th = S.th, main = ctx.createGain(); main.gain.value = 0; main.connect(b.music);
  const ch = (vol, pan, verb, delay) => {
    const g = gainN(ctx, vol), p = panner(ctx, pan); g.connect(p); p.connect(main);
    if (verb) { const v = gainN(ctx, verb); p.connect(v).connect(b.musicVerb); }
    if (delay) { const v = gainN(ctx, delay); p.connect(v).connect(b.musicDelay.inp); }
    return g;
  };
  const vb = th.verb ?? 0.4, dl = th.delay ?? 0.2;
  return {
    main,
    pad: ch(1, 0, vb * 0.9, 0), arp: ch(1, -0.25, vb * 0.7, dl), lead: ch(1, 0.18, vb * 0.8, dl * 0.8), bass: ch(1, 0, 0.05, 0),
    drums: ch(1, 0, vb * 0.25, 0), amb: ch(1, 0.3, vb, dl * 0.5), choir: ch(1, -0.1, vb, 0),
  };
}
const INST = { pluck: V.pluck, harp: V.harp, bell: V.bell, marimba: V.marimba, flute: V.flute, brass: V.brass, choir: V.choir, pad: V.pad, bass: V.bass };

// ── 음 하나를 미리 녹음해 두고 다시 틀기 (CPU 절약)
// 같은 악기·높이·길이의 음은 처음 한 번만 실시간 합성하고, 그동안 뒤에서 녹음해 둠 → 다음부터는 녹음을 재생(노드 2개)
const CACHE = new Map(); let cacheBytes = 0, busy = 0; const jobs = [];
const LOW = { bass: 16000, pad: 16000, choir: 16000 };
function tail(inst, dur, o) {
  switch (inst) {
    case "pluck": return (o.decay ?? Math.max(0.28, Math.min(1.4, dur * 1.6))) + 0.1;
    case "harp": return (o.decay ?? 1.6) + 0.1;
    case "bell": return (o.decay ?? 1.8) + 0.1;
    case "marimba": return (o.decay ?? 0.42) + 0.1;
    case "choir": return dur + (o.release ?? 0.7) + 0.1;
    case "pad": return dur + (o.release ?? 1.1) + 0.1;
    case "flute": case "brass": return dur + 0.3;
    case "bass": return dur + (o.release ?? 0.09) + 0.1;
  }
  return dur + 1;
}
const DRUM_LEN = { kick: 0.45, snare: 0.26, hat: 0.1, hato: 0.35, shaker: 0.1, taiko: 0.72, tom: 0.4, tick: 0.05, clap: 0.22, crash: 1.7, rim: 0.07 };
function pumpJobs() {
  while (busy < 2 && jobs.length) {
    const j = jobs.shift(); busy++;
    let ctx;
    try { ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(j.len * j.rate)), j.rate); const g = ctx.createGain(); g.connect(ctx.destination); j.fn(g); }
    catch { busy--; CACHE.delete(j.key); continue; }
    ctx.startRendering().then((buf) => { const e = CACHE.get(j.key); if (e) { e.buf = buf; cacheBytes += buf.length * 4; } })
      .catch(() => CACHE.delete(j.key)).finally(() => { busy--; pumpJobs(); });
  }
}
function remember(key, len, rate, fn) {
  if (cacheBytes > 48e6 || CACHE.size > 1500) { CACHE.clear(); cacheBytes = 0; }
  CACHE.set(key, {}); jobs.push({ key, len, rate, fn }); pumpJobs();
}
function playBuf(d, t, buf, vel) {
  const c = d.context, s = c.createBufferSource(), g = c.createGain();
  s.buffer = buf; g.gain.value = vel; s.connect(g).connect(d); s.start(Math.max(t, c.currentTime));
}
export const STATS = { hit: 0, miss: 0, live: {} };
export const NOTE_INSTS = Object.keys(INST);
function note(d, inst, t, f, dur, vel, o = {}) {
  const key = `${inst}|${f.toFixed(2)}|${dur.toFixed(2)}|${o.wave ?? ""}|${o.cutoff ?? ""}|${o.attack ?? ""}|${o.release ?? ""}|${o.vowel ?? ""}|${o.decay ?? ""}`;
  const e = CACHE.get(key);
  if (M.dry) { if (!e && M.sample) remember(key, tail(inst, dur, o), LOW[inst] ?? M.rate, (g) => INST[inst](g, 0, f, dur, 1, o)); return; }
  if (e?.buf) { STATS.hit++; return playBuf(d, t, e.buf, vel); }
  STATS.miss++; STATS.live[inst] = (STATS.live[inst] ?? 0) + 1;
  INST[inst](d, t, f, dur, vel, o);
  if (!e && M.sample) remember(key, tail(inst, dur, o), LOW[inst] ?? M.rate, (g) => INST[inst](g, 0, f, dur, 1, o));
}
function drum(d, name, t, vel, x) {
  const key = `d|${name}|${x ?? ""}`, e = CACHE.get(key);
  const fn = name === "hato" ? (g, tt, v) => V.hat(g, tt, v, true) : (g, tt, v) => V[name](g, tt, v, x);
  if (M.dry) { if (!e && M.sample) remember(key, DRUM_LEN[name] ?? 0.5, M.rate, (g) => fn(g, 0, 1)); return; }
  if (e?.buf) { STATS.hit++; return playBuf(d, t, e.buf, vel); }
  STATS.miss++; STATS.live[name] = (STATS.live[name] ?? 0) + 1;
  fn(d, t, vel);
  if (!e && M.sample) remember(key, DRUM_LEN[name] ?? 0.5, M.rate, (g) => fn(g, 0, 1));
}

/** 한 칸(16분음표) 연주. bar: 전체 마디 번호, s: 0~15 */
function step(S, C, bar, s, t, spb) {
  const th = S.th, sd = spb / 4, cyc = S.cycle, bpc = th.bpc ?? 1;
  const pos = bar % cyc, ci = Math.floor(pos / bpc), chord = th.prog[ci], nextChord = th.prog[(ci + 1) % th.prog.length];
  const secN = Math.floor(bar / cyc), sec = secN === 0 ? "I" : th.intense ? ["A", "B", "A", "B"][(secN - 1) % 4] : ["A", "B", "A", "C"][(secN - 1) % 4];
  const hum = (v = 0.08) => 1 + (Math.random() - 0.5) * 2 * v;
  const sw = th.swing ? (s % 4 === 2 ? th.swing * sd : s % 2 === 1 ? th.swing * sd * 0.5 : 0) : 0;
  const tt = t + sw;
  const barStart = s === 0, chordStart = barStart && pos % bpc === 0;

  // 화음 패드 · 합창 · 지속음
  if (chordStart) {
    const dur = bpc * spb * 4, center = 57;
    if (th.pad) {
      const f = th.pad.inst === "choir" ? "choir" : "pad";
      for (const d of chordTones(chord)) note(C.pad, f, t, mtof(fold(deg2m(S, d), center - 7, center + 6)), dur * 0.98, th.pad.vol * hum(0.05), { wave: th.pad.wave, cutoff: th.pad.cutoff, attack: th.pad.attack, vowel: th.pad.vowel });
    }
    if (th.choir && sec !== "I" && !M.lite) note(C.choir, "choir", t, mtof(fold(deg2m(S, chord + 4), 62, 73)), dur * 0.95, th.choir.vol, { attack: 0.6, release: 1 });
    if (th.drone && pos === 0) { note(C.pad, "pad", t, mtof(fold(th.root, 31, 42)), cyc * spb * 4, th.drone.vol, { wave: "triangle", cutoff: 500, attack: 2, release: 2 }); note(C.pad, "pad", t, mtof(fold(th.root, 31, 42) + 7), cyc * spb * 4, th.drone.vol * 0.6, { wave: "triangle", cutoff: 500, attack: 2, release: 2 }); }
  }
  // 분산화음
  if (th.arp) {
    const a = th.arp, every = 16 / (a.rate ?? 8);
    if (s % every === 0) {
      const tok = a.pat.split(" "), idx = (s / every + (bar % 2) * (16 / every)) % tok.length, tk = tok[idx];
      const thin = (sec === "I" || sec === "C" || (M.lite && every === 1)) && (s / every) % 2 === 1;
      if (tk !== "." && !thin) {
        const n = +tk, ct = chordTones(chord), d = ct[n % 3] + 7 * Math.floor(n / 3);
        const m = fold(deg2m(S, d) - th.root + S.arpBase, S.arpBase - 3, S.arpBase + 17);
        note(C.arp, a.inst, tt, mtof(m), sd * every * 1.4, a.vol * hum() * (s % 4 === 0 ? 1 : 0.8), { wave: a.wave, decay: a.decay ?? (a.inst === "bell" ? 1.2 : undefined) });
      }
    }
  }
  // 선율 (A·B 구간)
  if (th.lead && (sec === "A" || sec === "B")) {
    const ph = Math.floor((pos * 16 + s) / 32) % 4, local = (pos % 2) * 16 + s;
    const mo = sec === "B" ? (ph === 3 ? S.motifs[3] : S.motifs[2]) : S.motifs[ph];
    for (const n of mo) if (n.s === local) {
      let d = n.abs != null ? n.abs : chord + n.d;
      if (n.abs == null && n.s % 8 === 0) d = snapChord(d, chord);
      while (d > 9) d -= 7; while (d < -3) d += 7;
      const m = deg2m(S, d) - th.root + S.leadBase;
      note(C.lead, th.lead.inst, tt, mtof(m), n.len * sd * 0.92, th.lead.vol * hum(), { decay: th.lead.inst === "bell" ? 1.6 : undefined });
    }
  }
  // 베이스
  if (th.bass) {
    const bs = th.bass, br = deg2m(S, chord), lo = 36, hi = 47, root = mtof(fold(br, lo, hi)), o = { wave: bs.wave };
    const vol = bs.vol * (sec === "I" ? 0.7 : 1);
    switch (bs.pat) {
      case "hold": if (chordStart) note(C.bass, "bass", t, root, bpc * spb * 4 * 0.95, vol, { ...o, release: 0.4 }); break;
      case "pulse": if (s % 2 === 0) note(C.bass, "bass", t, root, sd * 1.6, vol * (s % 4 === 0 ? 1 : 0.75), o); break;
      case "drive": if (s % 2 === 0) note(C.bass, "bass", t, root * ([0, 0, 2, 0, 0, 2, 1.5, 0][(s / 2) % 8] || 1), sd * 1.5, vol * (s % 4 === 0 ? 1 : 0.8), o); break;
      case "gallop": if ([0, 3, 4, 8, 11, 12].includes(s)) note(C.bass, "bass", t, root, sd * 1.4, vol, o); break;
      case "walk": if (s % 4 === 0) { const w = [0, 4, 7, 4][s / 4], approach = s === 12 && (pos % bpc === bpc - 1) ? deg2m(S, nextChord) - 1 : null; note(C.bass, "bass", tt, approach ? mtof(fold(approach, lo, hi + 2)) : mtof(fold(deg2m(S, chord + w), lo, hi + 7)), sd * 3.4, vol, o); } break;
    }
  }
  // 북
  if (th.drums) {
    const dr = th.drums, v = dr.vol * (sec === "C" ? 0.55 : 1), last = pos === cyc - 1;
    const hit = (pat, name) => { const c = pat?.[s]; if (c === "x" || c === "o") drum(C.drums, name, tt, v * (c === "o" ? 0.55 : 1) * hum(0.1)); };
    if (sec === "I") { if (s === 0 && bar % 2 === 0) drum(C.drums, dr.taiko ? "taiko" : "kick", t, v * 0.6); }
    else {
      hit(dr.kick, "kick"); hit(dr.taiko, "taiko"); hit(dr.tom, "tom"); hit(dr.shaker, "shaker"); hit(dr.rim, "rim"); hit(dr.tick, "tick"); hit(dr.clap, "clap");
      if (sec !== "C") { hit(dr.snare, "snare"); hit(dr.hat, "hat"); }
      if (th.fill && last && s >= 12 && sec !== "C") { if (s % 2) drum(C.drums, "snare", tt, v * (0.6 + (s - 12) * 0.12)); else drum(C.drums, "tom", tt, v * (0.6 + (s - 12) * 0.12), 110 + (15 - s) * 30); }
      if (th.crash && barStart && pos === 0 && (sec === "A" || sec === "B")) drum(C.drums, "crash", t, v * 0.8);
    }
  }
  // 환경음
  if (th.amb && barStart && !M.lite && !M.dry && Math.random() < th.amb.p) amb(th.amb.kind, C.amb, t + Math.random() * spb * 3, S);
}

function amb(kind, d, t, S) {
  const c = d.context, r = Math.random;
  switch (kind) {
    case "waves": V.sweep(d, t, 380, 900, 3.6, 0.14, { type: "lowpass", q: 0.6, swell: true }); break;
    case "wind": V.sweep(d, t, 300 + r() * 300, 900 + r() * 800, 3 + r() * 2, 0.1, { q: 3, swell: true }); break;
    case "drips": for (let i = 0; i < 1 + (r() * 2 | 0); i++) { const tt = t + i * (0.3 + r() * 0.6), f = 900 + r() * 900, o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 2, tt + 0.04); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.09, tt + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.09); o.connect(g).connect(d); o.start(tt); o.stop(tt + 0.12); } break;
    case "sparkle": for (let i = 0; i < 3 + (r() * 3 | 0); i++) V.bell(d, t + i * 0.09, mtof(deg2m(S, 7 + (r() * 9 | 0)) + 12), 0.1, 0.035, { decay: 1.4, ratio: 2, index: 0.8 }); break;
    case "embers": for (let i = 0; i < 5; i++) { const tt = t + r() * 1.2; V.sweep(d, tt, 2500 + r() * 3000, 2000, 0.015, 0.08, { q: 2 }); } break;
    case "bubbles": for (let i = 0; i < 3 + (r() * 3 | 0); i++) { const tt = t + i * (0.08 + r() * 0.15), f = 250 + r() * 300, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 2.4, tt + 0.05); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.07, tt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06); o.connect(g).connect(d); o.start(tt); o.stop(tt + 0.08); } break;
    case "thunder": V.sweep(d, t, 160, 60, 3.2, 0.5, { type: "lowpass", q: 0.5, attack: 0.05 }); V.sweep(d, t, 2400, 500, 0.4, 0.12, { type: "highpass" }); break;
    case "whisper": V.sweep(d, t, 900 + r() * 900, 1400 + r() * 1200, 2.5, 0.06, { q: 9, swell: true }); V.choir(d, t, mtof(S.th.root + 24 + [0, 1, 3][r() * 3 | 0]), 1.5, 0.03, { attack: 0.8, release: 1, vowel: "o" }); break;
    case "birds": for (let i = 0; i < 2 + (r() * 3 | 0); i++) { const tt = t + i * 0.13, f = 2600 + r() * 1600, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * (r() < 0.5 ? 1.35 : 0.75), tt + 0.07); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.035, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08); o.connect(g).connect(d); o.start(tt); o.stop(tt + 0.1); } break;
    case "toll": V.bell(d, t, mtof(S.th.root), 0.1, 0.12, { decay: 3.2, ratio: 1.4, index: 1.6 }); break;
    case "gears": for (let i = 0; i < 4; i++) V.tick(d, t + i * 0.11, 0.7); V.sweep(d, t + 0.5, 300, 180, 0.4, 0.06, { type: "lowpass" }); break;
    case "heartbeat": V.kick(d, t, 0.32); V.kick(d, t + 0.22, 0.22); break;
  }
}

// ── 재생 관리 ───────────────────────────────────────────
const M = { cur: null, want: null, timer: 0, scene: () => null, sample: true, rate: 44100 };
/** 장면 → 곡 이름을 알려 주는 함수 등록 (game.js 쪽 상태를 읽음) */
export function setSceneFn(fn, liteFn) { M.scene = fn; M.liteFn = liteFn; }
export function nowPlaying() { return M.cur && !M.cur.stopping ? M.cur.S.th.name : null; }
function start(key) {
  const ctx = AU.ctx, b = AU.bus, S = compile(key), C = makeChannels(S, ctx, b), t0 = ctx.currentTime + 0.12;
  M.rate = Math.min(44100, ctx.sampleRate);
  C.main.gain.setValueAtTime(0, t0); C.main.gain.linearRampToValueAtTime(NORM[key] ?? 1, t0 + 2.2);
  b.musicDelay.set(Math.min(1.2, (60 / S.th.bpm) * 0.75));
  // 미리 녹음: 곡 한 바퀴(구간 5개)를 소리 없이 훑어 필요한 음을 모두 녹음 대기열에 넣고, 다 될 때까지(최대 5초) 기다렸다 시작
  //  → 처음부터 녹음 재생만으로 연주 (실시간 합성이 몰리는 첫 몇 마디의 부하 제거)
  M.dry = true;
  try { const spb = 60 / S.th.bpm; for (let n = 0; n < S.cycle * 5 * 16; n++) step(S, C, Math.floor(n / 16), n % 16, 0, spb); } catch {}
  M.dry = false;
  M.cur = { key, S, C, n: 0, t: t0, readyAt: performance.now() + 5000 };
}
function stop(fade = 1.4) {
  const c = M.cur; if (!c) return; M.cur = null;
  const ctx = AU.ctx, now = ctx.currentTime, g = c.C.main.gain;
  g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade);
  setTimeout(() => { try { c.C.main.disconnect(); } catch {} }, (fade + 3) * 1000);
}
function pump() {
  if (!AU.ctx || AU.ctx.state !== "running") return;
  const want = AU.on && AU.bgmOn && AU.bgmVol > 0 ? M.scene() : null;
  if ((M.cur?.key ?? null) !== want) { stop(); if (want && THEMES[want]) start(want); }
  const c = M.cur; if (!c) return;
  try { M.lite = !!M.liteFn?.(); } catch {}
  const ctx = AU.ctx, spb = 60 / c.S.th.bpm, sd = spb / 4;
  if (c.readyAt) {
    if ((busy || jobs.length) && performance.now() < c.readyAt) { c.t = ctx.currentTime + 0.15; return; }
    c.readyAt = 0; c.t = ctx.currentTime + 0.1;
    c.C.main.gain.cancelScheduledValues(ctx.currentTime); c.C.main.gain.setValueAtTime(0, ctx.currentTime); c.C.main.gain.linearRampToValueAtTime(NORM[c.key] ?? 1, ctx.currentTime + 2);
  }
  if (c.t < ctx.currentTime - 0.2) c.t = ctx.currentTime + 0.05; // 멈췄다 돌아오면 밀린 음을 한꺼번에 치지 않음
  while (c.t < ctx.currentTime + 0.3) {
    try { step(c.S, c.C, Math.floor(c.n / 16), c.n % 16, c.t, spb); } catch {}
    c.n++; c.t += sd;
  }
}
export function startMusic() {
  if (M.timer) return;
  M.timer = setInterval(pump, 60);
  onAudio(() => pump());
}

/** 검사용: 곡 하나를 오프라인으로 bars 마디 렌더 */
export async function renderTheme(key, bars = 8, rate = 22050, makeBus, sample = false) {
  M.sample = sample; M.rate = rate;
  const S = compile(key), spb = 60 / S.th.bpm, sec = bars * spb * 4 + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(sec * rate), rate), b = makeBus(ctx), C = makeChannels(S, ctx, b);
  C.main.gain.value = NORM[key] ?? 1; b.music.gain.value = 0.42 * 0.36;
  for (let n = 0; n < bars * 16; n++) step(S, C, Math.floor(n / 16) + S.cycle, n % 16, 0.05 + n * spb / 4, spb);
  const out = await ctx.startRendering(); M.sample = true; return out;
}
/** 검사용: 녹음 대기열이 빌 때까지 */
export const sampleIdle = () => new Promise((r) => { const w = () => (busy || jobs.length ? setTimeout(w, 20) : r(CACHE.size)); w(); });
