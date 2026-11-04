import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { getPortraitTransformAnchor, getPortraitTransformPivotOffset } from "../scripts/core/portraitTransformPivot.js";

const source = await readFile(new URL("../scripts/features/portraits.js", import.meta.url), "utf8");
function section(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing production section: ${start}`);
  return source.slice(first, last);
}
const close = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${actual} should be ${expected}`
);

test("the grabbed point stays fixed when scaling and rotating centered, bottom-anchored and mirrored portraits", () => {
  for (const bottom of [false, true]) for (const flip of [-1, 1]) {
    const width = 240, height = 700, scale = 1.03;
    const origin = { x: width / 2, y: bottom ? height : height / 2 };
    const angle = 27 * Math.PI / 180, baseScale = 1.4;
    const matrix = { a: Math.cos(angle) * baseScale * flip, b: Math.sin(angle) * baseScale * flip,
      c: -Math.sin(angle) * baseScale, d: Math.cos(angle) * baseScale };
    const screenPoint = (x, y) => ({
      x: 400 + scale * (35 + matrix.a * (x - origin.x) + matrix.c * (y - origin.y)),
      y: 800 + scale * (-20 + matrix.b * (x - origin.x) + matrix.d * (y - origin.y))
    });
    const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => screenPoint(x, y));
    const rect = { left: Math.min(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)) };
    // Include grabs on art extending outside the narrow wrapper frame.
    for (const point of [{ x: 20, y: 100 }, { x: 420, y: 650 }, origin]) {
      const anchor = getPortraitTransformAnchor({ point: screenPoint(point.x, point.y), rect, width, height, origin, matrix, scale });
      const expected = { x: matrix.a * (point.x - origin.x) + matrix.c * (point.y - origin.y),
        y: matrix.b * (point.x - origin.x) + matrix.d * (point.y - origin.y) };
      close(anchor.x, expected.x); close(anchor.y, expected.y);
      for (const ratio of [0.4, 1, 2]) for (const degrees of [-80, 0, 45]) {
        const offset = getPortraitTransformPivotOffset(anchor, ratio, degrees);
        const radians = degrees * Math.PI / 180;
        close(offset.x + ratio * (Math.cos(radians) * anchor.x - Math.sin(radians) * anchor.y), expected.x);
        close(offset.y + ratio * (Math.sin(radians) * anchor.x + Math.cos(radians) * anchor.y), expected.y);
      }
    }
  }
});

function setup() {
  const properties = new Map();
  const state = { actorId: "actor", pointerId: 1, startX: 400, startY: 300,
    startRect: { width: 300, height: 600 }, lastDx: 0, lastDy: 0, dragScale: 1,
    transformAnchor: { x: 70, y: -180 },
    manualTransform: { x: 30, y: -20, scale: 1.2, tilt: 10 }, dragging: true,
    wrapper: { classList: { toggle() {} }, style: { setProperty: (key, value) => properties.set(key, value) } } };
  const globals = {
    getPortraitTransformAnchor, getPortraitTransformPivotOffset,
    activePortraitDrag: state,
    PORTRAIT_DRAG: { startThresholdPx: 6, minDetachPx: 60, detachRatio: 0.3, maxTiltDeg: 10,
      pointerScaleSpeed: 0.004, pointerRotateSpeedDeg: 0.18, wheelScaleSpeed: 0.00075 },
    PORTRAIT_KEYBINDINGS: { TRANSFORM_DRAG: "alt" },
    clampNumber: (value, min, max) => Math.max(min, Math.min(max, Number(value))),
    clampPortraitScale: value => Math.max(0.5, Math.min(2, value)),
    clampPortraitTilt: value => Math.max(-45, Math.min(45, value)),
    getPortraitDragScaleRange: () => ({ min: 0.5, max: 2 }),
    beginPortraitDrag() {}, setPortraitDragTarget() {}, setPortraitNameDragVisual() {}, emitPortraitDragPreview() {},
    isPortraitControlKeyActive: (_, event) => !!event.altKey,
    findPortraitDragTarget: () => null,
    game: { user: { id: "sender" } }, canvas: { scene: { id: "scene" } }
  };
  const api = vm.runInNewContext([
    section("  function normalizePortraitManualTransform(", "  function getPortraitLayerZIndex("),
    section("  function getPortraitDragFinalManualTransform(", "  function userOwnsPortraitActor("),
    section("  function applyPortraitDragVisual(", "  function emitPortraitDragPreview("),
    section("  function updatePortraitDrag(", "  function _onPortraitPointerDown("),
    "; ({ updatePortraitDrag, updatePortraitDragScale, getPortraitDragFinalManualTransform, getPortraitDragPayload, applyPortraitDragVisual })"
  ].join("\n"), globals);
  return { state, globals, properties, ...api };
}
function pointer(x, y, altKey = true) {
  return { pointerId: 1, clientX: x, clientY: y, altKey, preventDefault() {}, stopPropagation() {} };
}
function assertAnchor(h) {
  const { state, properties } = h;
  const ratio = state.dragScale, angle = state.lastTilt * Math.PI / 180;
  const anchor = state.transformAnchor;
  const dx = Number.parseFloat(properties.get("--ginzzzu-drag-x"));
  const dy = Number.parseFloat(properties.get("--ginzzzu-drag-y"));
  close(dx + ratio * (Math.cos(angle) * anchor.x - Math.sin(angle) * anchor.y), anchor.x + state.lastDx, 0.03);
  close(dy + ratio * (Math.sin(angle) * anchor.x + Math.cos(angle) * anchor.y), anchor.y + state.lastDy, 0.03);
}

test("Alt scaling and rotation keep the original grab point, including limits and modifier changes", () => {
  const h = setup();
  h.updatePortraitDrag(pointer(400, 300));
  h.updatePortraitDrag(pointer(500, 200));
  close(h.state.dragScale, Math.exp(0.4));
  close(h.state.lastTilt, 18);
  assertAnchor(h);
  const before = new Map(h.properties);
  h.updatePortraitDrag(pointer(500, 200, false));
  assert.deepEqual(h.properties, before, "Releasing Alt made the portrait jump");
  h.updatePortraitDrag(pointer(500, 200));
  h.updatePortraitDrag(pointer(2000, -2000));
  close(h.state.dragScale * h.state.manualTransform.scale, 2);
  close(h.state.lastTilt + h.state.manualTransform.tilt, 45);
  assertAnchor(h);
});

test("wheel scaling and saved poses include the pivot compensation", () => {
  const h = setup();
  h.updatePortraitDragScale({ deltaY: -300 });
  assertAnchor(h);
  const saved = h.getPortraitDragFinalManualTransform(h.state);
  close(saved.x, h.state.manualTransform.x + Number.parseFloat(h.properties.get("--ginzzzu-drag-x")), 0.02);
  close(saved.y, h.state.manualTransform.y + Number.parseFloat(h.properties.get("--ginzzzu-drag-y")) + h.state.lastLift, 0.02);
  close(saved.scale, h.state.manualTransform.scale * h.state.dragScale, 0.001);
  close(saved.tilt, h.state.manualTransform.tilt + h.state.lastTilt, 0.01);
});

test("remote previews receive the same pivot compensation without applying it twice", () => {
  const h = setup();
  h.updatePortraitDrag(pointer(400, 300));
  h.updatePortraitDrag(pointer(500, 200));
  const payload = h.getPortraitDragPayload(h.state, "move");
  const local = new Map(h.properties);
  const remote = { ...h.state, remote: true, transformAnchor: null };
  h.globals.game.user.id = "receiver";
  const key = "drag";
  Object.assign(h.globals, {
    remotePortraitDrags: new Map([[key, remote]]), getRemotePortraitDragKey: () => key,
    getPortraitDragActor: () => ({}), canUserReorderPortrait: () => true, isPortraitDragSyncEnabled: () => true
  });
  const preview = vm.runInNewContext([
    section("  function getPortraitDragFinalManualTransform(", "  function userOwnsPortraitActor("),
    section("  function applyPortraitDragVisual(", "  function emitPortraitDragPreview("),
    section("  function applyRemotePortraitDragPreview(", "  function findPortraitDragTarget("),
    "; applyRemotePortraitDragPreview"
  ].join("\n"), h.globals);
  preview(payload);
  assert.deepEqual(h.properties, local);
});
