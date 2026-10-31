import assert from "node:assert/strict";
import test from "node:test";
import { resolvePortraitOffsets } from "../scripts/core/portraitOffsets.js";

test("zero percentage offsets preserve the existing rail and sidebar layout", () => {
  const result = resolvePortraitOffsets({ width: 1920, height: 1080, sidebarWidth: 300, legacyBottomPx: 40 });
  assert.deepEqual(result, {
    left: 0, right: 0, railWidth: 1920, top: 0, bottom: 40, legacyBottom: 40,
    leftPadding: 8, rightPadding: 308, bandWidth: Math.floor(1920 * 0.98) - 316
  });
});

test("left and right offsets support positive and negative window percentages", () => {
  const inset = resolvePortraitOffsets({ width: 2000, height: 1000, leftPercent: 10, rightPercent: 20 });
  assert.equal(inset.left, 200);
  assert.equal(inset.right, 400);
  assert.equal(inset.railWidth, 1400);
  const outward = resolvePortraitOffsets({ width: 2000, height: 1000, leftPercent: -10, rightPercent: -20 });
  assert.equal(outward.left, -200);
  assert.equal(outward.right, -400);
  assert.equal(outward.railWidth, 2600);
  assert.ok(outward.bandWidth > inset.bandWidth);
});

test("bottom percentages move in both directions and add the legacy pixel offset", () => {
  const up = resolvePortraitOffsets({ width: 2000, height: 1000, bottomPercent: 12.5, legacyBottomPx: 50 });
  const down = resolvePortraitOffsets({ width: 2000, height: 1000, bottomPercent: -12.5, legacyBottomPx: 50 });
  assert.equal(up.bottom, 175);
  assert.equal(down.bottom, -75);
  assert.equal(up.top, -125);
  assert.equal(down.top, 125);
  assert.equal(up.top + up.bottom, up.legacyBottom);
  assert.equal(down.top + down.bottom, down.legacyBottom);
  assert.equal(up.legacyBottom, 50);
  assert.equal(down.legacyBottom, 50);
});

test("percentage offsets adapt to the window size while pixel offsets stay fixed", () => {
  const input = { leftPercent: 5, rightPercent: -10, bottomPercent: -5, legacyBottomPx: 25 };
  const small = resolvePortraitOffsets({ ...input, width: 1000, height: 500 });
  const large = resolvePortraitOffsets({ ...input, width: 2000, height: 1000 });
  assert.equal(large.left, small.left * 2);
  assert.equal(large.right, small.right * 2);
  assert.equal(large.bottom - 25, (small.bottom - 25) * 2);
});

test("extreme or malformed settings keep geometry finite and never produce negative padding", () => {
  const collapsed = resolvePortraitOffsets({ width: 1000, height: 500, leftPercent: 100, rightPercent: 100 });
  assert.equal(collapsed.railWidth, 1);
  assert.equal(collapsed.bandWidth, 1);
  const invalid = resolvePortraitOffsets({ width: NaN, height: 0, leftPercent: Infinity,
    rightPercent: "bad", bottomPercent: null, sidebarWidth: -100, legacyBottomPx: -30 });
  assert.equal(Object.values(invalid).every(Number.isFinite), true);
  assert.equal(invalid.leftPadding, 8);
  assert.equal(invalid.rightPadding, 8);
  assert.equal(invalid.bottom, 0);
  const bounded = resolvePortraitOffsets({ width: 1000, height: 500, leftPercent: -1000, bottomPercent: 1000 });
  assert.equal(bounded.left, -1000);
  assert.equal(bounded.bottom, 500);
});
