import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { portraitImageChangesRowFit } from "../scripts/core/portraitRowFit.js";
import * as constants from "../scripts/core/constants.js";
import { getPortraitVerticalOffsetPx } from "../scripts/core/portraitOffsets.js";

const source = await readFile(new URL("../scripts/features/portraits.js", import.meta.url), "utf8");
// Execute the production functions with controlled DOM/animation boundaries.
// The surrounding Foundry bootstrap is unrelated to these rendering checks.
function productionFunction(name, endMarker, globals) {
  const start = source.indexOf(`  ${name === "_applyEmotionImageWithTransition" ? "async " : ""}function ${name}(`);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Could not locate ${name}`);
  return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, globals);
}

function rect(left, top, width = 100, height = 200) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

test("actor and emotion offset changes update the HUD even when portrait art stays the same", () => {
  const flags = { portraitVerticalOffsetPercent: 10, portraitEmotion: "custom_0",
    customEmotions: [{ verticalOffsetPercent: 20 }, { verticalOffsetPercent: -30 }] };
  const actor = { id: "a", flags: { [constants.MODULE_ID]: flags } };
  const image = { src: "https://example.test/art.webp" };
  const properties = new Map();
  const wrapper = { querySelector: () => image, style: { setProperty: (key, value) => properties.set(key, value) } };
  let updateActor, layouts = 0, imageChanges = 0;
  const globals = {
    ...constants, getPortraitVerticalOffsetPx,
    document: { documentElement: { clientHeight: 1000 }, getElementById: () => ({ querySelector: () => wrapper }) },
    window: { innerHeight: 1000 },
    Hooks: { on: (_, callback) => { updateActor = callback; } },
    foundry: { utils: { hasProperty: (changes, path) => Object.hasOwn(changes, path) } },
    actorUpdateTouchesPortraitBaseImage: () => false,
    _getActorImage: () => image.src,
    relayoutDomHud: () => layouts++, _applyEmotionImageWithTransition: () => imageChanges++, console
  };
  globals.applyPortraitVerticalOffset = productionFunction("applyPortraitVerticalOffset", "  // Применить «жёсткую»", globals);
  const start = source.indexOf('  Hooks.on("updateActor",', source.indexOf("// React to emotion / customEmotions changes"));
  const end = source.indexOf("  // Приём socket-запросов", start);
  vm.runInNewContext(source.slice(start, end), globals);
  const offset = () => properties.get("--ginzzzu-config-offset-y");

  updateActor(actor, { [constants.FLAG_PORTRAIT_VERTICAL_OFFSET_PERCENT]: 10 });
  assert.equal(offset(), "-300px");
  flags.portraitEmotion = "custom_1";
  updateActor(actor, { [constants.FLAG_PORTRAIT_EMOTION]: "custom_1" });
  assert.equal(offset(), "200px");
  flags.customEmotions[1].verticalOffsetPercent = -50;
  updateActor(actor, { [constants.FLAG_CUSTOM_EMOTIONS]: flags.customEmotions });
  assert.equal(offset(), "400px");
  flags.portraitEmotion = null;
  updateActor(actor, { [constants.FLAG_PORTRAIT_EMOTION]: null });
  assert.equal(offset(), "-100px");
  globals.window.innerHeight = 500;
  globals.document.documentElement.clientHeight = 500;
  globals.applyPortraitVerticalOffset(wrapper, actor);
  assert.equal(offset(), "-50px");
  assert.equal(layouts, 0, "An individual offset unnecessarily relaid out the entire row");
  assert.equal(imageChanges, 0, "An individual offset unnecessarily replaced the portrait image");
});

function setup({ duration = 320, autofit = true, ratio = 0.5, load, onFrame, onTransition } = {}) {
  const timers = new Map(); let sequence = 0, layouts = 0, loads = 0;
  const style = () => ({ removeProperty(key) { delete this[key]; } });
  const image = (width, height) => ({
    naturalWidth: width, naturalHeight: height, isConnected: false, style: style(), dataset: {},
    className: "ginzzzu-portrait", alt: "Actor", listeners: new Map(),
    addEventListener(name, callback) {
      this.listeners.set(name, callback);
      queueMicrotask(() => {
        onTransition?.(this);
        this.listeners.get(name)?.({ propertyName: "opacity", target: this });
      });
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
    nextAnimationFrame: async () => { onFrame?.(); },
    requestAnimationFrame: callback => queueMicrotask(() => { onFrame?.(); callback(); }),
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

test("a delayed emotion decode cannot restore a portrait after its hide command", async () => {
  for (const duration of [0, 320]) {
    let finish;
    const h = setup({ duration, load: prepared => new Promise(resolve => { finish = () => resolve(prepared); }) });
    const pending = h.swap();
    h.wrapper.dataset.threeoPortraitClosing = "1";
    h.wrapper.dataset.threeoEmotionTransitionToken = "closing";
    h.old.style.opacity = "0";
    h.old.remove(); h.map.delete("a");
    finish(); await pending;
    assert.equal(h.parent.children.length, 0);
    assert.equal(h.map.has("a"), false);
    assert.equal(h.old.style.opacity, "0");
  }
});

test("hiding during either emotion fade cannot reveal an overlay or revive the actor map", async () => {
  for (const phase of ["out", "in"]) {
    let hidden = false;
    const h = setup({ onTransition(image) {
      if (hidden || (phase === "out" ? image !== h.old : image !== h.prepared)) return;
      hidden = true;
      h.wrapper.dataset.threeoPortraitClosing = "1";
      h.wrapper.dataset.threeoEmotionTransitionToken = "closing";
      for (const child of h.parent.children) child.style.opacity = "0";
    } });
    await h.swap();
    assert.equal(hidden, true);
    assert.equal(h.parent.children.length, 1);
    assert.equal(h.parent.children[0], h.old);
    assert.equal(h.old.style.opacity, "0");
    assert.equal(h.map.get("a"), h.old);
    assert.equal(h.prepared.isConnected, false);
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
  const first = new Map(images.map((image, i) => [image, rect(i * 100, 20)]));
  const last = new Map(images.map((image, i) => [image, rect(i * 100 + 0.0001, 20)]));
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
  animate([stationary, moving], new Map([[stationary, rect(0, 0)], [moving, rect(200, 0)]]),
    new Map([[stationary, rect(0, 0)], [moving, rect(150, 10)]]));
  assert.equal(reads, 2); assert.equal(calls.length, 1);
  assert.equal(calls[0][0].transform, "translate(-50px, -10px)");
  cleanup(); assert.equal(calls.at(-1), "cancel");
});

test("emotion height changes keep the floor in novel mode and the center in normal mode", () => {
  const animate = productionFunction("animateFlip", "  // Перераскладка ряда с FLIP", {
    getComputedStyle() { throw Error("A height-only change should not create a movement animation"); }
  });
  const image = { animate() { throw Error("Resizing made a stationary portrait fly to its anchor"); } };
  for (const anchorBottom of [false, true]) {
    // Large -> small and small -> large, including art wider than the viewport.
    for (const [before, after] of [[1600, 300], [300, 1600]]) {
      const box = height => rect(700 - height / 4, 900 - height * (anchorBottom ? 1 : 0.5), height / 2, height);
      animate([image], new Map([[image, box(before)]]), new Map([[image, box(after)]]), { anchorBottom });
    }
  }
});

test("resizing during row reflow animates only the real anchor displacement and respects mirroring", () => {
  let keyframes;
  const image = { closest: () => ({}), animate(frames) { keyframes = frames; return { cancel() {} }; } };
  const animate = productionFunction("animateFlip", "  // Перераскладка ряда с FLIP", {
    _ANIM: { moveMs: 1200, easing: "ease-out" },
    getComputedStyle: element => ({ transform: element === image ? "none" : "matrix(-1,0,0,1,0,0)" }),
    scheduleAfterAnimationSettles() {}
  });
  // The bottom center moves from (500, 900) to (400, 880), while the art shrinks.
  animate([image], new Map([[image, rect(300, 100, 400, 800)]]),
    new Map([[image, rect(350, 680, 100, 200)]]), { anchorBottom: true });
  assert.equal(keyframes[0].transform, "translate(-100px, 20px)");
  assert.equal(keyframes[1].transform, "none");
});

test("row layout chooses the anchor from the final novel-mode geometry", () => {
  for (const anchorBottom of [false, true]) {
    let applied = false, animationOptions;
    const image = { getBoundingClientRect: () => rect(0, 0) };
    const root = { querySelector: () => ({}), classList: { contains: () => { assert.equal(applied, true); return anchorBottom; } } };
    const layout = productionFunction("relayoutDomHud", "  function revealPortraitImage(", {
      getDomHud: () => root, getPortraitLayoutImages: () => [image], collectFirstRects: () => new Map(),
      document: { documentElement: { clientWidth: 1200 } }, window: { innerWidth: 1200 },
      applyGeometry: () => { applied = true; },
      animateFlip: (images, first, last, options) => { animationOptions = options; }
    });
    layout();
    assert.equal(animationOptions.anchorBottom, anchorBottom);
  }
});
