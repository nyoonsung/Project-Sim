import assert from "node:assert/strict";
import {
  DURABILITY_VERSION, RARITIES, ensureDur, maxDurability, makeItem, rollItem, starterGear,
} from "../shared/items.js";

const expected = [450, 540, 630, 720, 1080, 1200];
for (let i = 0; i < RARITIES.length; i++) {
  const item = { slot: "weapon", rarity: RARITIES[i] };
  assert.equal(maxDurability(item), expected[i], `${RARITIES[i]} max durability`);
}

// Legacy equipment gets upgraded once while retaining its remaining durability percentage.
for (let i = 0; i < RARITIES.length; i++) {
  const oldMax = 100 + i * 20;
  const item = { slot: "weapon", rarity: RARITIES[i], dur: oldMax * 0.4, maxDur: oldMax };
  ensureDur(item);
  assert.equal(item.maxDur, expected[i]);
  assert.equal(item.dur, expected[i] * 0.4);
  assert.equal(item.durV, DURABILITY_VERSION);
  ensureDur(item);
  assert.equal(item.maxDur, expected[i], "migration must not multiply durability twice");
  assert.equal(item.dur, expected[i] * 0.4);
}


// V2 items (the immediately previous 3x/4x durability) retain their remaining percentage.
const previousV2 = [300, 360, 420, 480, 720, 800];
for (let i = 0; i < RARITIES.length; i++) {
  const item = { slot: "armor", rarity: RARITIES[i], dur: previousV2[i] * 0.4, maxDur: previousV2[i], durV: 2 };
  ensureDur(item);
  assert.equal(item.maxDur, expected[i]);
  assert.equal(item.dur, expected[i] * 0.4);
  assert.equal(item.durV, DURABILITY_VERSION);
}

// A broken legacy item remains broken after the migration.
const broken = { slot: "armor", rarity: "신화", dur: 0, maxDur: 180 };
ensureDur(broken);
assert.equal(broken.maxDur, 1080);
assert.equal(broken.dur, 0);

// Newly created, admin-created, and starter equipment all use the new values.
const rolled = rollItem(() => 0.99, { ilvl: 100, cls: "sword", rarity: "신화" });
const made = makeItem({ slot: "weapon", type: "sword", rarity: "신화", ilvl: 100 });
const rolledAbyss = rollItem(() => 0.99, { ilvl: 100, cls: "sword", rarity: "심연" });
const madeAbyss = makeItem({ slot: "weapon", type: "sword", rarity: "심연", ilvl: 100 });
assert.equal(rolled.maxDur, 1080);
assert.equal(made.maxDur, 1080);
assert.equal(rolledAbyss.maxDur, 1200);
assert.equal(madeAbyss.maxDur, 1200);
assert.equal(rolledAbyss.abyssEffects.length, 2);
assert.equal(madeAbyss.abyssEffects.length, 2);
assert.equal(rolledAbyss.opts.length, 5);
assert.equal(madeAbyss.opts.length, 5);
for (const item of Object.values(starterGear())) assert.equal(item.maxDur, expected[0]);

console.log("DURABILITY TESTS: ALL PASS");
