import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { portraitImageChangesRowFit } from "../scripts/core/portraitRowFit.js";

const source = await readFile(new URL("../scripts/features/portraits.js", import.meta.url), "utf8");
// Execute the production functions with controlled DOM/animation boundaries.
// The surrounding Foundry bootstrap is unrelated to these rendering checks.
function productionFunction(name, endMarker, globals) {
  const start = source.indexOf(`  ${name === "_applyEmotionImageWithTransition" ? "async " : ""}function ${name}(`);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not locate ${name}`);
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, globals);
}

function setup({ duration = 320, autofit = true, ratio = 0.5, load } = {}) {
  const timers = new Map(); let sequence = 0, layouts = 0, loads = 0;
  const style = () => ({ removeProperty(key) { delete this[key]; } });
  const image = (width, height) => ({
    naturalWidth: width, naturalHeight: height, isConnected: false, style: style(), dataset: {},
    className: "ginzzzu-portrait", alt: "Actor", listeners: new Map(),
    addEventListener(name, callback) {
      this.listeners.set(name, callback);
      queueMicrotask(() => this.listeners.get(name)?.({ propertyName: "opacity", target: this }));
    },
    removeEventListener(name) { this.listeners.delete(name); },
    remove() { this.isConnected = false; this.parentElement.children = this.parentElement.children.filter(el => el !== this); },
    replaceWith(next) { this.parentElement.insertBefore(next, this); this.remove(); }
  });
  const old = image(500, 1000), prepared = image(1000 * ratio, 1000);
  old.dataset = { actorId: "a", src: "old.webp", baseTransform: "none" }; old.isConnected = true;
  const parent = {
    children: [old],
    insertBefore(element, sibling) {
      element.parentElement = this; element.isConnected = true;
      const index = this.children.indexOf(sibling);
      this.children.splice(index < 0 ? this.children.length : index, 0, element);
    },
    appendChild(element) { this.insertBefore(element, null); }
  };
  old.parentElement = parent;
  const wrapper = { dataset: { src: "old.webp" } }, map = new Map([["a", old]]);
  const globals = {
    MODULE_ID: "ginzzzu-portraits", portraitImageChangesRowFit,
    game: { settings: { get: (_, key) => key === "resizeToFit" ? autofit : duration } },
    _ANIM: { easing: "ease-out" },
    _loadDecodedImageElement: async () => { loads++; return load ? load(prepared) : prepared; },
    _copyPortraitImageState(from, to, src) { to.dataset = { ...from.dataset, src }; },
    nextAnimationFrame: () => Promise.resolve(),
    requestAnimationFrame: callback => queueMicrotask(callback),
    setTimeout(callback, delay) { timers.set(++sequence, { callback, delay }); return sequence; },
    clearTimeout: id => timers.delete(id),
    getComputedStyle: () => ({ transform: "none" }),
    window: { getComputedStyle: () => ({ opacity: "1" }) },
    domStore: () => map,
    relayoutDomHud: () => layouts++,
    console: { warn() {} }
  };
  const swap = productionFunction("_applyEmotionImageWithTransition", "  // ---- Реакция всех клиентов", globals);
  return { old, prepared, wrapper, parent, map, timers, swap: () => swap(wrapper, old, "new.webp"),
    get layouts() { return layouts; }, get loads() { return loads; } };
}

test("emotion swaps with matching proportions never relayout the row after fading", async () => {
  for (const duration of [0, 320]) {
    const h = setup({ duration }); await h.swap();
    assert.equal(h.loads, 1); assert.equal(h.layouts, 0);
    assert.equal(h.map.get("a"), h.prepared);
    assert.equal(h.wrapper.dataset.src, "new.webp");
    assert.equal(h.old.isConnected, false); assert.equal(h.prepared.isConnected, true);
    assert.equal(h.wrapper.dataset.threeoEmotionTransitionToken, undefined);
    for (const { callback } of h.timers.values()) callback();
    assert.equal(h.layouts, 0, "A delayed callback relaid out the unchanged row");
  }
});

test("changed proportions refit exactly once with and without image animation", async () => {
  for (const duration of [0, 320]) {
    const h = setup({ duration, ratio: 0.8 }); await h.swap();
    assert.equal(h.layouts, 1); assert.equal(h.map.get("a"), h.prepared);
    const disabled = setup({ duration, ratio: 0.8, autofit: false }); await disabled.swap();
    assert.equal(disabled.layouts, 0);
  }
});

test("failed decoding and superseded emotion changes do not relayout or replace the current art", async () => {
  const failed = setup({ load: () => { throw new Error("decode failed"); } }); await failed.swap();
  assert.equal(failed.layouts, 0); assert.equal(failed.map.get("a"), failed.old);
  const stale = setup({ load: prepared => { stale.wrapper.dataset.threeoEmotionTransitionToken = "newer"; return prepared; } });
  await stale.swap();
  assert.equal(stale.layouts, 0); assert.equal(stale.map.get("a"), stale.old);
  assert.equal(stale.wrapper.dataset.threeoEmotionTransitionToken, "newer");
});

test("image resolution changes preserve fit while changed image proportions request a refit", () => {
  assert.equal(portraitImageChangesRowFit({ naturalWidth: 500, naturalHeight: 1000 }, { naturalWidth: 2000, naturalHeight: 4000 }), false);
  assert.equal(portraitImageChangesRowFit({ naturalWidth: 500, naturalHeight: 1000 }, { naturalWidth: 800, naturalHeight: 1000 }), true);
});

test("a stationary 200-portrait row does no transform reads, animations or deferred cleanup", () => {
  let reads = 0, animations = 0, cleanup = 0;
  const animate = productionFunction("animateFlip", "  // Перераскладка ряда с FLIP", {
    _ANIM: { moveMs: 300, easing: "ease-out" },
    getComputedStyle: () => { reads++; return { transform: "none" }; },
    scheduleAfterAnimationSettles: () => cleanup++
  });
  const images = Array.from({ length: 200 }, () => ({ animate() { animations++; } }));
  const first = new Map(images.map((image, i) => [image, { left: i * 100, top: 20 }]));
  const last = new Map(images.map((image, i) => [image, { left: i * 100 + 0.0001, top: 20 }]));
  animate(images, first, last);
  assert.equal(reads, 0); assert.equal(animations, 0); assert.equal(cleanup, 0);
});

test("row reflow animates only moved portraits and keeps mirrored direction and cleanup", () => {
  let cleanup, reads = 0; const calls = [];
  const flipped = { transform: "matrix(-1,0,0,1,0,0)" };
  const moving = { closest: () => flipped, animate(keyframes) { calls.push(keyframes); return { cancel() { calls.push("cancel"); } }; } };
  const stationary = { animate() { throw new Error("Unchanged portrait animated"); } };
  const animate = productionFunction("animateFlip", "  // Перераскладка ряда с FLIP", {
    _ANIM: { moveMs: 300, easing: "ease-out" },
    getComputedStyle: element => { reads++; return { transform: element === flipped ? flipped.transform : "none" }; },
    scheduleAfterAnimationSettles: (_, callback) => { cleanup = callback; }
  });
  animate([stationary, moving], new Map([[stationary, { left: 0, top: 0 }], [moving, { left: 200, top: 0 }]]),
    new Map([[stationary, { left: 0, top: 0 }], [moving, { left: 150, top: 10 }]]));
  assert.equal(reads, 2); assert.equal(calls.length, 1);
  assert.equal(calls[0][0].transform, "translate(-50px, -10px)");
  cleanup(); assert.equal(calls.at(-1), "cancel");
});
