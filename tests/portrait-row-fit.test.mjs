import assert from "node:assert/strict";
import test from "node:test";
import { resolvePortraitRowFit } from "../scripts/core/portraitRowFit.js";
import { resolvePortraitHeights } from "../scripts/core/portraitHeights.js";
import { resolvePortraitOffsets } from "../scripts/core/portraitOffsets.js";

function assertFits(result, ratios, availableWidth) {
  for (const [index, height] of result.heightsPx.entries()) {
    assert.ok(height * ratios[index] <= result.slotWidthPx + 1e-8, `Portrait ${index} overflows its frame`);
  }
  const rowWidth = result.slotWidthPx * result.heightsPx.length + result.gapPx * Math.max(0, result.heightsPx.length - 1);
  assert.ok(rowWidth <= availableWidth + 1e-8, "Frames overflow the portrait area");
}

test("a crowded novel row shrinks actual artwork into separate frames", () => {
  const heightsPx = Array(6).fill(800);
  const aspectRatios = [0.5, 0.6, 0.45, 0.55, 0.4, 0.5];
  const result = resolvePortraitRowFit({ heightsPx, aspectRatios, availableWidth: 1200 });
  assert.ok(result.scale < 1);
  assert.ok(result.heightsPx.every(height => height < 800));
  assertFits(result, aspectRatios, 1200);
});

test("one shared scale preserves character height ratios and does not mutate configured sizes", () => {
  const heightsPx = [400, 800, 1600];
  const aspectRatios = [0.5, 0.5, 0.5];
  const result = resolvePortraitRowFit({ heightsPx, aspectRatios, availableWidth: 900 });
  assertFits(result, aspectRatios, 900);
  assert.ok(Math.abs(result.heightsPx[0] * 4 - result.heightsPx[2]) <= 4);
  assert.ok(Math.abs(result.heightsPx[1] * 2 - result.heightsPx[2]) <= 2);
  assert.deepEqual(heightsPx, [400, 800, 1600]);
});

test("ample width leaves portrait heights unchanged, even when they extend above the screen", () => {
  const result = resolvePortraitRowFit({ heightsPx: [2400], aspectRatios: [0.1], availableWidth: 1000 });
  assert.equal(result.scale, 1);
  assert.deepEqual(result.heightsPx, [2400]);
  const pair = resolvePortraitRowFit({ heightsPx: [400, 800], aspectRatios: [0.5, 0.5], availableWidth: 1400 });
  assert.equal(pair.scale, 1);
  assert.deepEqual(pair.heightsPx, [400, 800]);
});

test("disabling autofit restores fixed heights after a crowded row was scaled", () => {
  const heightsPx = resolvePortraitHeights({ viewportHeight: 1000, portraitHeight: 0.8, multipliers: [0.5, 1, 2] }).heightsPx;
  const options = { heightsPx, aspectRatios: [0.5, 0.5, 0.5], availableWidth: 900 };
  assert.ok(resolvePortraitRowFit(options).scale < 1);
  assert.equal(resolvePortraitRowFit({ ...options, enabled: false }), null);
  assert.deepEqual(heightsPx, [400, 800, 1600]);
});

test("the available row width includes side offsets and the sidebar", () => {
  const offsets = resolvePortraitOffsets({ width: 1920, height: 1080, leftPercent: 10, rightPercent: 10, sidebarWidth: 300 });
  const aspectRatios = Array(5).fill(0.6);
  const result = resolvePortraitRowFit({ heightsPx: Array(5).fill(900), aspectRatios, availableWidth: offsets.bandWidth });
  assertFits(result, aspectRatios, offsets.bandWidth);
});

test("very crowded and fractional-pixel rows remain finite and fit every frame", () => {
  for (const devicePixelRatio of [1, 1.25, 2]) {
    const aspectRatios = Array(200).fill(0.75);
    const result = resolvePortraitRowFit({ heightsPx: Array(200).fill(800), aspectRatios, availableWidth: 800, devicePixelRatio });
    assertFits(result, aspectRatios, 800);
    assert.ok(result.heightsPx.every(Number.isFinite));
  }
  const empty = resolvePortraitRowFit({ availableWidth: 1000 });
  assert.deepEqual(empty.heightsPx, []);
  const bad = resolvePortraitRowFit({ heightsPx: [NaN, -1], aspectRatios: [0, Infinity], availableWidth: 100 });
  assert.ok(bad.heightsPx.every(Number.isFinite));
});
