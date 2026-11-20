import assert from "node:assert/strict";
import {
  ABYSS_EFFECTS, RARITIES, RARITY_MUL, RARITY_OPTS,
  rollAbyssRelic, rollAbyssVaultItem, ensureAbyss,
  gearTotals, maxDurability,
} from "../shared/items.js";

const rng = (seed = 0x5eed1234) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

assert.equal(RARITIES[5], "심연");
assert.ok(RARITY_MUL[5] > RARITY_MUL[4], "Abyss base stat multiplier must exceed Mythic");
assert.equal(RARITY_OPTS[5], 5, "Abyss gear must have five random options");
assert.ok(maxDurability({ rarity: "심연" }) > maxDurability({ rarity: "신화" }));

const random = rng();
const names = new Map();
const relics = new Map();
const N = 200_000;
let abyssCount = 0;
for (let i = 0; i < N; i++) {
  const item = rollAbyssVaultItem(random, { ilvl: 100, cls: "sword" });
  assert.equal(item.ilvl, 100);
  assert.ok(["일반", "희귀", "영웅", "전설", "심연"].includes(item.rarity));
  if (item.rarity === "심연") {
    abyssCount++;
    assert.ok(item.relic);
    assert.equal(item.abyssEffects.length, 2);
    assert.ok(item.abyssEffects.every((key) => ABYSS_EFFECTS[key]));
    relics.set(item.relic, (relics.get(item.relic) ?? 0) + 1);
  } else {
    assert.equal(item.relic, undefined);
    names.set(item.rarity, (names.get(item.rarity) ?? 0) + 1);
  }
}
assert.ok(Math.abs(abyssCount / N - 0.05) < 0.002, `Abyss total should approximate 5%, got ${(abyssCount / N * 100).toFixed(3)}%`);
assert.equal(relics.size, 5, "all five named Abyss relics must be obtainable");
for (const [id, count] of relics) {
  assert.ok(Math.abs(count / N - 0.01) < 0.0015, `${id} should approximate 1%, got ${(count / N * 100).toFixed(3)}%`);
}
for (const rarity of ["일반", "희귀", "영웅", "전설"]) assert.ok((names.get(rarity) ?? 0) > 0, `${rarity} rewards must remain available`);

const sample = rollAbyssRelic(random, { ilvl: 100, cls: "sword" });
assert.equal(sample.rarity, "심연");
assert.equal(sample.opts.length, 5);
assert.equal(sample.abyssEffects.length, 2);
assert.equal(new Set(sample.abyssEffects).size, 2);
const equippedTotals = gearTotals({ [sample.slot]: sample });
assert.equal(equippedTotals.abyssEffects.length, 2);

const legacy = structuredClone(sample);
legacy.rarity = "전설";
legacy.abyssV = 0;
legacy.abyssEffects = undefined;
legacy.maxDur = maxDurability({ rarity: "전설" });
legacy.dur = legacy.maxDur * 0.6;
ensureAbyss(legacy);
assert.equal(legacy.rarity, "심연");
assert.equal(legacy.abyssEffects.length, 2);
assert.equal(legacy.opts.length, 5);
assert.ok(Math.abs(legacy.dur / legacy.maxDur - 0.6) < 0.001, "legacy durability percentage must be preserved");
const before = JSON.stringify(legacy);
ensureAbyss(legacy);
assert.equal(JSON.stringify(legacy), before, "legacy migration must be idempotent");

console.log("✓ 심연 보관고 확률·다섯 유물·특수효과 2개·기존 유물 승급 검사 완료");
