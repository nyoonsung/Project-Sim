import assert from "node:assert/strict";
import { CLASS_INFO } from "../shared/classes.js";
import { MAX_LEVEL } from "../shared/constants.js";
import {
  MAX_ENH, RARITY_OPTS, WEAPON_TYPES, OFFHAND_TYPES, optionMax,
} from "../shared/items.js";
import { makeMaxAbyssBundle, MAX_ABYSS_BUNDLE_COUNT } from "../server/gm-items.js";

const items = makeMaxAbyssBundle();
assert.equal(MAX_ABYSS_BUNDLE_COUNT, 38);
assert.equal(items.length, MAX_ABYSS_BUNDLE_COUNT);
assert.equal(new Set(items.map((it) => it.uid)).size, 1, "items are not assigned account UIDs before delivery");
for (const item of items) {
  assert.equal(item.rarity, "심연");
  assert.equal(item.ilvl, MAX_LEVEL);
  assert.equal(item.enh, MAX_ENH);
  assert.equal(item.ench, "dmg");
  assert.equal(item.locked, true);
  assert.equal(item.opts.length, RARITY_OPTS[5]);
  assert.equal(item.abyssEffects.length, 2);
  assert.equal(item.dur, item.maxDur);
  assert.equal(new Set(item.opts.map((o) => o.k)).size, item.opts.length);
  for (const opt of item.opts) {
    assert.ok(Math.abs(opt.v - optionMax(opt.k, MAX_LEVEL, 5) * 3) < 0.001, `${item.name} option ${opt.k} must be at the maximum allowed roll`);
  }
}
const generic = items.filter((it) => !it.relic && !it.classRelic);
assert.equal(generic.length, 25);
assert.deepEqual(new Set(generic.filter((it) => it.slot === "weapon").map((it) => it.type)), new Set(Object.keys(WEAPON_TYPES)));
assert.deepEqual(new Set(generic.filter((it) => it.slot === "offhand").map((it) => it.type)), new Set(Object.keys(OFFHAND_TYPES)));
for (const slot of ["helmet", "armor", "trinket"]) {
  assert.deepEqual(new Set(generic.filter((it) => it.slot === slot).map((it) => it.variant)), new Set([0, 1, 2, 3]));
}
const relics = items.filter((it) => it.relic);
assert.equal(relics.length, 5);
assert.equal(new Set(relics.map((it) => it.relic)).size, 5, "all five unique Abyss relics are included");
const classRelics = items.filter((it) => it.classRelic);
assert.equal(classRelics.length, Object.keys(CLASS_INFO).length);
assert.deepEqual(new Set(classRelics.map((it) => it.classRelic)), new Set(Object.keys(CLASS_INFO)));
console.log("MAX ABYSS BUNDLE TESTS: ALL PASS (38 items, Lv.250, +99, five maxed options)");
