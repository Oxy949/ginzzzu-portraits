import assert from "node:assert/strict";
import test from "node:test";
import { getPortraitHeightMultiplier, resolvePortraitHeights } from "../scripts/core/portraitHeights.js";
import { resolvePortraitOffsets } from "../scripts/core/portraitOffsets.js";

test("short and tall characters retain their configured height, including above-screen heights", () => {
  const result = resolvePortraitHeights({ viewportHeight: 1000, portraitHeight: 0.8, multipliers: [0.5, 1, 1.5, 2] });
  assert.equal(result.baseHeightPx, 800);
  assert.deepEqual(result.heightsPx, [400, 800, 1200, 1600]);
  assert.ok(result.heightsPx[3] > 1000);
});

test("adding many portraits never rescales the existing characters", () => {
  const single = resolvePortraitHeights({ viewportHeight: 1080, portraitHeight: 0.8, multipliers: [1] });
  const crowd = resolvePortraitHeights({ viewportHeight: 1080, portraitHeight: 0.8, multipliers: [1, 3, ...Array(200).fill(0.5)] });
  assert.equal(single.heightsPx[0], 864);
  assert.equal(crowd.heightsPx[0], single.heightsPx[0]);
  assert.equal(crowd.heightsPx[1], 2592);
});

test("a negative bottom offset moves the shared floor below the screen without resizing art", () => {
  const offsets = resolvePortraitOffsets({ width: 1920, height: 1000, bottomPercent: -20 });
  const heights = resolvePortraitHeights({ viewportHeight: 1000, portraitHeight: 0.8, multipliers: [0.5, 1, 2] }).heightsPx;
  const floor = 1000 - offsets.bottom;
  assert.equal(floor, 1200);
  assert.deepEqual(heights.map(height => floor - height), [800, 400, -400]);
  assert.deepEqual(heights, [400, 800, 1600]);
  // A tall character extends above the screen while its feet stay at the same
  // (intentionally offscreen) floor as the short character's feet.
  assert.equal(floor - heights[2] < 0, true);
});

test("base and emotion multipliers combine without offsets or image dimensions", () => {
  const actor = { flags: { "ginzzzu-portraits": { portraitHeightMultiplier: 1.5, emotionHeightMultiplier: 0.8 } } };
  assert.ok(Math.abs(getPortraitHeightMultiplier(actor) - 1.2) < 1e-12);
  actor.flags["ginzzzu-portraits"].portraitHeightMultiplier = 0;
  assert.equal(getPortraitHeightMultiplier(actor), 0);
  delete actor.flags["ginzzzu-portraits"].portraitHeightMultiplier;
  delete actor.flags["ginzzzu-portraits"].emotionHeightMultiplier;
  assert.equal(getPortraitHeightMultiplier(actor), 1);
  assert.equal(getPortraitHeightMultiplier(null), 1);
});

test("height rounding remains stable at fractional display scales and malformed inputs", () => {
  const values = resolvePortraitHeights({ viewportHeight: 999, portraitHeight: 0.8, multipliers: [1, 0.75], devicePixelRatio: 1.25 });
  for (const height of values.heightsPx) assert.equal(height * 1.25, Math.round(height * 1.25));
  const invalid = resolvePortraitHeights({ viewportHeight: Infinity, portraitHeight: NaN, multipliers: [NaN, -1, Infinity] });
  assert.deepEqual(invalid.heightsPx, [0, 0, 0]);
});
