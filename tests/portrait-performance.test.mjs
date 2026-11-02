import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import * as constants from "../scripts/core/constants.js";

const source = await readFile(new URL("../scripts/features/portraits.js", import.meta.url), "utf8");
function section(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing production section: ${start}`);
  return source.slice(first, last);
}
const breathing = section("  const PORTRAIT_BREATHING_ANIMATION_KEY", "  // ---- DOM HUD");
const lifecycle = section("  async function openLocalPortrait(", "  async function _applyEmotionImageWithTransition(");

function setup() {
  let starts = 0, cancellations = 0;
  const timers = [], map = new Map(), pendingPortraitOpens = new Map();
  const multipliers = new Map();
  const settings = { portraitBreathingEnabled: true, portraitBreathingStrength: 0.5, portraitBreathingDurationMs: 4200 };
  let wrappers = Array.from({ length: 100 }, (_, index) => {
    const wrapper = {
      dataset: { actorId: String(index) }, style: { setProperty() {}, removeProperty() {} },
      classList: { contains: () => true }, contains: element => element?.wrapper === wrapper,
      remove() { wrappers = wrappers.filter(element => element !== this); },
      animate() { starts++; return { cancel() { cancellations++; } }; }
    };
    map.set(String(index), { closest: () => wrapper, dataset: {}, style: {}, remove() {}, wrapper });
    wrapper.querySelectorAll = () => [map.get(String(index))];
    return wrapper;
  });
  const root = { isConnected: true, querySelectorAll: () => wrappers, querySelector: () => null };
  const globals = {
    ...constants, pendingPortraitOpens, Element: class {},
    document: { activeElement: null, createElement() { throw Error("A cancelled open tried to mount a portrait"); } },
    game: { actors: { get: id => ({ id }) }, settings: { get: (_, key) => settings[key] } },
    foundry: { utils: { getProperty: actor => multipliers.get(actor.id) ?? 1 } },
    getDomHud: () => root, domStore: () => map, _toneApplyToRootVars() {}, _getDisplayName: () => "Actor",
    _focusedActorId: null, _ANIM: { fadeMs: 100, moveMs: 200 }, collectFirstRects: () => new Map(),
    setTimeout: callback => timers.push(callback), relayoutDomHud() {}, removeBlur() {}, removePortraitLayer() {},
    console
  };
  const api = vm.runInNewContext(`${breathing}\n${lifecycle}
    ; ({applyPortraitBreathing, closeLocalPortrait, openLocalPortrait})`, globals);
  return { ...api, globals, settings, multipliers, map, timers, root,
    get starts() { return starts; }, get cancellations() { return cancellations; },
    reorder() { wrappers.reverse(); wrappers.pop(); },
    get wrappers() { return wrappers; }
  };
}

test("reordering or removing portraits preserves the other breathing animations", () => {
  const h = setup();
  h.applyPortraitBreathing(); assert.equal(h.starts, 100);
  h.reorder(); h.applyPortraitBreathing();
  assert.equal(h.starts, 100); assert.equal(h.cancellations, 0);
  h.multipliers.set("50", 2); h.applyPortraitBreathing();
  assert.equal(h.starts, 101); assert.equal(h.cancellations, 1);
  h.settings.portraitBreathingEnabled = false; h.applyPortraitBreathing();
  assert.equal(h.cancellations, 100);
});

test("closing a portrait schedules cleanup once and cancels its infinite animation", () => {
  const h = setup(); h.applyPortraitBreathing();
  h.closeLocalPortrait("0"); h.closeLocalPortrait("0");
  assert.equal(h.timers.length, 1);
  h.timers[0]();
  assert.equal(h.cancellations, 1);
  assert.equal(h.map.has("0"), false);
  assert.equal(h.wrappers.length, 99);
});

test("repeated show requests share pending image work and hiding cancels a late image decode", async () => {
  const h = setup(); let loads = 0, finish;
  h.globals._loadPortraitImageElement = () => { loads++; return new Promise(resolve => { finish = resolve; }); };
  const first = h.openLocalPortrait({ actorId: "pending", img: "slow.webp" });
  const second = h.openLocalPortrait({ actorId: "pending", img: "slow.webp" });
  assert.equal(loads, 1);
  h.closeLocalPortrait("pending");
  finish({}); await Promise.all([first, second]);
  assert.equal(h.map.has("pending"), false);
});

test("a cancelled main-image load does not start a placeholder load or create DOM", async () => {
  const h = setup(); let fail, loads = 0;
  h.globals._loadPortraitImageElement = () => { loads++; return new Promise((resolve, reject) => { fail = reject; }); };
  const pending = h.openLocalPortrait({ actorId: "pending", img: "slow.webp" });
  h.closeLocalPortrait("pending");
  fail(Error("connection timed out")); await pending;
  assert.equal(loads, 1);
  assert.equal(h.map.has("pending"), false);
});

test("hiding while a fallback image loads also cancels the late mount", async () => {
  const h = setup(); let finish; const loaded = [];
  h.globals._loadPortraitImageElement = src => {
    loaded.push(src);
    return src === "slow.webp" ? Promise.reject(Error("network error"))
      : new Promise(resolve => { finish = resolve; });
  };
  h.globals.console = { warn() {} };
  const pending = h.openLocalPortrait({ actorId: "pending", img: "slow.webp" });
  await new Promise(setImmediate);
  assert.deepEqual(loaded, ["slow.webp", "icons/svg/mystery-man.svg"]);
  h.closeLocalPortrait("pending"); finish({}); await pending;
  assert.equal(h.map.has("pending"), false);
});

test("a queued first reveal respects a hide arriving before the next frame in both layout modes", () => {
  for (const visualNovelMode of [false, true]) {
    for (const state of ["visible", "closing", "removed"]) {
      const frames = []; let flips = 0;
      const reveal = vm.runInNewContext(`${section("  function revealPortraitImage(", "  const pendingPortraitOpens")}; revealPortraitImage`, {
        requestAnimationFrame: callback => frames.push(callback), _updateImgTransformForFlip: () => flips++
      });
      const wrapper = { dataset: {} };
      const image = { complete: false, isConnected: true, dataset: {}, style: { opacity: "0", transform: "translateY(12px)" } };
      reveal(wrapper, image, visualNovelMode);
      const loaded = image.onload; loaded(); loaded();
      assert.equal(frames.length, 1);
      if (state === "closing") wrapper.dataset.threeoPortraitClosing = "1";
      if (state === "removed") image.isConnected = false;
      frames[0]();
      assert.equal(image.style.opacity, state === "visible" ? "1" : "0");
      assert.equal(flips, state === "visible" ? 1 : 0);
      assert.equal(image.onload, null); assert.equal(image.onerror, null);
    }
  }
});

test("a stale close timer preserves a newer portrait and its name badge", () => {
  const h = setup(); let oldRemoved = 0, newRemoved = 0;
  h.root.querySelector = () => ({ remove() { oldRemoved++; } });
  h.closeLocalPortrait("0");
  h.root.querySelector = () => ({ remove() { newRemoved++; } });
  const current = { wrapper: {} };
  h.map.set("0", current);
  h.timers[0]();
  assert.equal(oldRemoved, 1); assert.equal(newRemoved, 0);
  assert.equal(h.map.get("0"), current);
});

test("cached images decode only once when both complete and load signal readiness", async () => {
  let decodes = 0, finish;
  const timers = new Map();
  const load = vm.runInNewContext(`${section("  function _loadDecodedImageElement(", "  function _loadPortraitImageElement(")}; _loadDecodedImageElement`, {
    Image: class {
      naturalWidth = 100; naturalHeight = 100;
      set src(value) { this.complete = true; queueMicrotask(() => this.onload?.()); }
      decode() { decodes++; return new Promise(resolve => { finish = resolve; }); }
    },
    queueMicrotask, setTimeout: callback => { timers.set(1, callback); return 1; },
    clearTimeout: id => timers.delete(id)
  });
  const pending = load("cached.webp");
  await Promise.resolve();
  assert.equal(decodes, 1);
  finish(); const image = await pending;
  assert.equal(image.onload, null); assert.equal(image.onerror, null);
  assert.equal(timers.size, 0);
});

test("a remote swap hold does not measure the entire portrait row for its four-second timeout", () => {
  const calls = [];
  const hold = vm.runInNewContext(`${section("  function holdRemotePortraitSwapDrag(", "  function clearPendingRemoteSwapDrag(")}; holdRemotePortraitSwapDrag`, {
    pendingRemoteSwapDrags: new Map(), setPortraitDragTarget() {},
    _ANIM: { moveMs: 300 }, setTimeout: () => 1,
    followNamePositionsFor: duration => calls.push(duration), scheduleNamePositionsUpdate() {}
  });
  hold({ actorId: "a", wrapper: { classList: { remove() {} } } });
  assert.equal(calls.length, 0, "Static network hold started full-row animation tracking");
});
