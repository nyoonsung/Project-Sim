// 조작 키 설정: 스킬 12칸 + 물약 3개 + 창 단축키. 브라우저에 저장해 두고 다음 접속에도 그대로
const DEFAULT = {
  slots: ["Mouse0", "Mouse2", "KeyQ", "KeyE", "KeyR", "KeyF", "ShiftLeft", "KeyV", "Digit4", "Digit5", "Digit6", "Digit7"],
  potions: ["Digit1", "Digit2", "Digit3"],
};
const STORE = "abyss.keys";
export const KEYS = load();

function load() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (o && Array.isArray(o.slots) && Array.isArray(o.potions) && o.potions.length === 3) {
      if (o.slots.length === 12) return o;
      if (o.slots.length === 8) {
        // 기존 사용자 키 설정·물약 단축키와 충돌하지 않는 번호키를 새 슬롯에 배정한다.
        const used = new Set([...o.slots, ...o.potions]);
        const candidates = [
          "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
          ...Array.from({ length: 10 }, (_, i) => "Numpad" + i),
          ...Array.from({ length: 24 }, (_, i) => "F" + (i + 1)),
        ];
        const extra = candidates.filter((code) => !used.has(code)).slice(0, 4);
        return { ...o, slots: [...o.slots, ...extra] };
      }
    }
  } catch {}
  return structuredClone(DEFAULT);
}
export function saveKeys() { try { localStorage.setItem(STORE, JSON.stringify(KEYS)); } catch {} }
export function resetKeys() { const d = structuredClone(DEFAULT); KEYS.slots = d.slots; KEYS.potions = d.potions; saveKeys(); }

/** 키 하나를 어떤 칸에 붙이기 (이미 다른 칸에 있으면 그 칸과 맞바꿈) */
export function bindKey(kind, i, code) {
  for (const k of ["slots", "potions"]) {
    const j = KEYS[k].indexOf(code);
    if (j >= 0 && !(k === kind && j === i)) KEYS[k][j] = KEYS[kind][i];
  }
  KEYS[kind][i] = code;
  saveKeys();
}
const same = (a, b) => a === b || (a?.startsWith("Shift") && b?.startsWith("Shift")) || (a?.startsWith("Control") && b?.startsWith("Control")) || (a?.startsWith("Alt") && b?.startsWith("Alt"));
export const slotForCode = (code) => KEYS.slots.findIndex((c) => same(c, code));
export const potionForCode = (code) => KEYS.potions.findIndex((c) => same(c, code));
/** 마우스 버튼 → 스킬 칸 */
export const slotForMouse = (btn) => KEYS.slots.indexOf("Mouse" + btn);

/** 화면에 보일 이름 */
export function keyLabel(code) {
  if (!code) return "";
  if (code === "Mouse0") return "LMB";
  if (code === "Mouse2") return "RMB";
  if (code === "Mouse1") return "MMB";
  if (code.startsWith("Shift")) return "⇧";
  if (code.startsWith("Control")) return "Ctrl";
  if (code.startsWith("Alt")) return "Alt";
  if (code === "Space") return "Spc";
  if (code === "Tab") return "Tab";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "N" + code.slice(6);
  return code.replace("Arrow", "").slice(0, 4);
}
/** 바꿀 수 없는 키 (이동·창 단축키와 겹치면 안 되는 것) */
export const RESERVED = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape",
  "KeyC", "KeyK", "KeyI", "KeyP", "KeyH", "KeyG", "KeyM", "KeyL", "KeyB", "KeyO", "KeyN", "KeyY"]);
