import assert from "node:assert/strict";
import { BOSS_HIT } from "../shared/constants.js";
import {
  bossCircleContains, bossRingContains, bossConeContains, bossDashContains,
} from "../server/game/ai.js";
import { objectDepthY } from "../public/js/render/depth.js";
import { meta as fireBreathMeta } from "../public/vendor/pixelfx/fx/fire/fire-breath.js";

assert.equal(BOSS_HIT.shrink, 8, "boss ground attacks use an 8px inner safety margin");
assert.equal(BOSS_HIT.proj, 4, "boss projectile collision radius is reduced");
assert.ok(bossCircleContains(20, 12, 0, 0, 60), "inside the visible ground ellipse should be hittable");
assert.ok(!bossCircleContains(0, 40, 0, 0, 60), "outside the flattened ground ellipse must be safe");
assert.ok(!bossCircleContains(53, 0, 0, 0, 60), "the outer 8px margin is safe");
assert.ok(bossRingContains(70, 0, 0, 0, 40, 90), "inside the ring should be hit");
assert.ok(!bossRingContains(45, 0, 0, 0, 40, 90), "inside the ring's inner safe hole should not be hit");
assert.ok(!bossRingContains(95, 0, 0, 0, 40, 90), "outside the ring's shrunken outer edge should be safe");
assert.ok(bossConeContains(60, 15, 0, 0, 100, 0, Math.PI / 4), "inside the cone should be hit");
assert.ok(!bossConeContains(30, 35, 0, 0, 100, 0, Math.PI / 4), "outside the visual cone should be safe");
assert.ok(bossDashContains(50, 16, 0, 0, 100, 0, 50), "inside the narrowed dash strip should be hit");
assert.ok(!bossDashContains(50, 18, 0, 0, 100, 0, 50), "just outside the dash strip should be safe");

assert.equal(fireBreathMeta.loop, false, "Red Dragon Fist fire effect must stop after its animation");
const dummy = { kind: "dummy", x: 100, y: 200 };
assert.equal(objectDepthY(dummy, [{ k: "p", rx: 100, ry: 190 }]), 189, "overlapping training dummy is drawn behind the player");
assert.equal(objectDepthY(dummy, [{ k: "p", rx: 140, ry: 190 }]), 200, "non-overlapping dummy keeps natural depth order");
assert.equal(objectDepthY({ kind: "tree", x: 100, y: 200 }, [{ rx: 100, ry: 190 }]), 200, "other objects keep their natural depth order");

console.log("BOSS HITBOX / FX / DEPTH TESTS: ALL PASS");
