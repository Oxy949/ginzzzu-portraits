// Run with: node --experimental-vm-modules --test tests/token-art-sync.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";
import test from "node:test";

const MODULE_ID = "ginzzzu-portraits";
const root = new URL("../", import.meta.url);
const clone = value => JSON.parse(JSON.stringify(value));

function getProperty(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function setProperty(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  for (const key of keys) object = object[key] ??= {};
  object[last] = value;
}

function collection() {
  const documents = new Map();
  documents[Symbol.iterator] = function* () { yield* this.values(); };
  return documents;
}

async function setup({ enabled = true, userId = "gm", gmId = "gm", transitionMs = 320 } = {}) {
  const hooks = new Map();
  const timers = new Map();
  const warnings = [];
  const errors = [];
  const writes = [];
  let timerId = 0;
  const settings = { syncTokenArt: enabled, actorImagePaths: "img, system.image", emotionImageTransitionMs: transitionMs };
  const game = {
    actors: collection(),
    user: { id: userId, isGM: userId === gmId },
    users: { activeGM: gmId ? { id: gmId } : null },
    settings: { get: (module, key) => settings[key] }
  };
  // Fails if a hot path starts scanning scenes or using the current canvas.
  Object.defineProperty(game, "scenes", { get() { throw Error("Unexpected scene scan"); } });
  const Hooks = {
    on(name, callback) {
      const callbacks = hooks.get(name) ?? [];
      callbacks.push(callback);
      hooks.set(name, callbacks);
    },
    once(name, callback) { this.on(name, callback); }
  };
  const context = vm.createContext({
    game, Hooks,
    foundry: { utils: { getProperty } },
    console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
    setTimeout(callback, delay) {
      assert.equal(delay, 50);
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: id => timers.delete(id)
  });
  const modules = new Map();
  function load(url) {
    if (!modules.has(url.href)) {
      modules.set(url.href, (async () => {
        const module = new vm.SourceTextModule(await readFile(url, "utf8"), {
          context, identifier: url.href
        });
        await module.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
        return module;
      })());
    }
    return modules.get(url.href);
  }
  await (await load(new URL("scripts/features/tokenArtSync.js", root))).evaluate();

  function emit(name, ...args) {
    for (const callback of hooks.get(name) ?? []) callback(...args);
  }
  async function tick() {
    const callbacks = Array.from(timers.values());
    timers.clear();
    callbacks.forEach(callback => callback());
    await setImmediate();
    assert.equal(errors.length, 0, errors[0]?.[0]);
  }
  async function drain() {
    for (let i = 0; timers.size && i < 20; i++) await tick();
    assert.equal(timers.size, 0, "Synchronization did not settle");
  }
  function actor(id, flags = {}, img = "base.webp") {
    const actor = {
      id, img, isOwner: true, isToken: false,
      prototypeToken: { texture: { src: "prototype.webp" } },
      flags: { [MODULE_ID]: flags },
      tokens: [], lookups: [],
      getDependentTokens(options) {
        this.lookups.push(clone(options));
        return this.tokens.filter(token =>
          (!options.linked || token.actorLink) &&
          (!options.concreteOnly || token.parent?.tokens.get(token.id) === token)
        );
      }
    };
    game.actors.set(id, actor);
    return actor;
  }
  function scene(id) {
    const scene = {
      id, tokens: collection(), beforeWrite: null, failure: null,
      async updateEmbeddedDocuments(type, updates, options) {
        assert.equal(type, "Token");
        writes.push({ scene: id, updates: clone(updates), options: clone(options) });
        if (this.beforeWrite) await this.beforeWrite();
        if (this.failure) throw this.failure;
        for (const update of updates) {
          const token = this.tokens.get(update._id);
          if (!token) continue;
          for (const [path, value] of Object.entries(update)) {
            if (path !== "_id") setProperty(token, path, value);
          }
        }
      }
    };
    return scene;
  }
  function token(actor, scene, id, { linked = true, persisted = true, image = "old.webp", allowed = true, ring } = {}) {
    const token = {
      id, parent: scene, actorId: actor.id, actorLink: linked,
      texture: { src: image, scaleX: 1.5, scaleY: 0.75 },
      ring, x: 100, width: 2, sourceUpdates: [],
      canUserModify: () => allowed,
      updateSource(changes) {
        this.sourceUpdates.push(clone(changes));
        for (const [path, value] of Object.entries(changes)) setProperty(this, path, value);
      }
    };
    actor.tokens.push(token);
    if (persisted) scene.tokens.set(id, token);
    return token;
  }
  function update(actor, flags, diff = { flags: { [MODULE_ID]: flags } }, source = "player") {
    Object.assign(actor.flags[MODULE_ID], flags);
    emit("updateActor", actor, diff, {}, source);
  }
  function toggle(value) {
    settings.syncTokenArt = value;
    emit("updateSetting", { key: `${MODULE_ID}.syncTokenArt` });
  }
  return { game, settings, emit, tick, drain, actor, scene, token, update, toggle, timers, writes, warnings };
}

test("disabled synchronization does no lookups, timers, or writes", async () => {
  const h = await setup({ enabled: false });
  const actor = h.actor("a");
  const token = h.token(actor, h.scene("one"), "t");
  h.emit("ready");
  h.update(actor, { portraitEmotion: "custom_0" });
  h.emit("preCreateToken", token);
  h.emit("createToken", token, {}, "player");
  h.emit("updateToken", token, { actorLink: true }, {}, "player");
  await h.drain();
  assert.equal(actor.lookups.length, 0);
  assert.equal(token.sourceUpdates.length, 0);
  assert.equal(h.writes.length, 0);
});

test("enabling reconciles linked tokens across scenes and batches each scene", async () => {
  const h = await setup({ enabled: false });
  const a = h.actor("a");
  const b = h.actor("b", {}, "b.webp");
  const one = h.scene("one");
  const two = h.scene("two");
  const changed = h.token(a, one, "a1");
  h.token(a, one, "a2");
  h.token(b, one, "b1");
  h.token(a, two, "a3");
  h.token(a, one, "unchanged", { image: "base.webp" });
  const unlinked = h.token(a, one, "unlinked", { linked: false });
  const ephemeral = h.token(a, one, "ephemeral", { persisted: false });
  const denied = h.token(a, one, "denied", { allowed: false });
  h.emit("ready");
  h.toggle(true);
  await h.drain();
  assert.equal(h.writes.length, 2);
  assert.deepEqual(h.writes[0].updates.map(update => update._id), ["a1", "a2", "b1"]);
  assert.deepEqual(h.writes[1].updates, [{ _id: "a3", "texture.src": "base.webp" }]);
  assert.deepEqual(a.lookups, [{ linked: true, concreteOnly: true }]);
  assert.equal(changed.texture.scaleX, 1.5);
  assert.equal(changed.x, 100);
  assert.equal(changed.width, 2);
  for (const token of [unlinked, ephemeral, denied]) assert.equal(token.texture.src, "old.webp");
  assert.equal(a.img, "base.webp");
  assert.equal(a.prototypeToken.texture.src, "prototype.webp");
});

test("custom emotion, custom portrait, and base art follow the portrait resolver", async () => {
  const h = await setup();
  const actor = h.actor("a", {
    portraitCustomImage: "custom.webp",
    customEmotions: [{ imagePath: "happy.webp" }, { imagePath: "sad.webp" }, { imagePath: "" }]
  });
  const token = h.token(actor, h.scene("one"), "t");
  h.emit("ready");
  await h.drain();
  assert.equal(token.texture.src, "custom.webp");
  h.update(actor, { portraitEmotion: "custom_0" });
  await h.drain();
  assert.equal(token.texture.src, "happy.webp");
  h.update(actor, { portraitEmotion: "custom_1" });
  await h.drain();
  assert.equal(token.texture.src, "sad.webp");
  h.update(actor, { portraitEmotion: null });
  await h.drain();
  assert.equal(token.texture.src, "custom.webp");
  h.update(actor, { portraitCustomImage: "", portraitEmotion: "custom_2" });
  await h.drain();
  assert.equal(token.texture.src, "base.webp");
});

test("color-only emotions skip writes, unrelated actor and token changes skip lookups", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const token = h.token(actor, h.scene("one"), "t", { image: "base.webp" });
  h.emit("ready");
  await h.drain();
  actor.lookups.length = 0;
  h.update(actor, {}, { system: { attributes: { hp: { value: 3 } } } });
  h.update(actor, {}, { flags: { [MODULE_ID]: { portraitHeightMultiplier: 2, displayName: "Name" } } });
  h.emit("updateToken", token, { x: 500, "texture.src": "manual.webp" }, {}, "player");
  assert.equal(actor.lookups.length, 0);
  assert.equal(h.timers.size, 0);
  h.update(actor, { portraitEmotion: "joy" });
  await h.drain();
  assert.equal(h.writes.length, 0);
});

test("portrait layout offsets never update tokens or trigger art synchronization", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const token = h.token(actor, h.scene("one"), "t", { image: "base.webp" });
  h.emit("ready");
  await h.drain();
  actor.lookups.length = 0;
  for (const key of ["portraitLeftOffsetPercent", "portraitRightOffsetPercent", "portraitBottomOffsetPercent", "portraitBottomOffset", "resizeToFit"]) {
    h.settings[key] = -25;
    h.emit("updateSetting", { key: `${MODULE_ID}.${key}` });
  }
  await h.drain();
  assert.equal(actor.lookups.length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(token.texture.src, "base.webp");
  assert.equal(token.texture.scaleX, 1.5);
  assert.equal(token.texture.scaleY, 0.75);
  assert.equal(token.width, 2);
  assert.equal(token.x, 100);
});

test("bursts across actors keep only the latest artwork in one scene update", async () => {
  const h = await setup();
  const a = h.actor("a", { customEmotions: [{ imagePath: "first.webp" }, { imagePath: "last.webp" }] });
  const b = h.actor("b");
  const scene = h.scene("one");
  const t = h.token(a, scene, "a");
  h.token(b, scene, "b");
  h.emit("ready");
  await h.drain();
  h.writes.length = 0;
  a.lookups.length = 0;
  h.update(a, { portraitEmotion: "custom_0" });
  h.update(b, { portraitCustomImage: "b-new.webp" });
  h.update(a, { portraitEmotion: "custom_1" });
  assert.equal(h.timers.size, 1);
  await h.drain();
  assert.equal(t.texture.src, "last.webp");
  assert.equal(a.lookups.length, 1);
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0].updates, [
    { _id: "a", "texture.src": "last.webp" },
    { _id: "b", "texture.src": "b-new.webp" }
  ]);
});

test("an in-flight write cannot overwrite a later emotion", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const scene = h.scene("one");
  const token = h.token(actor, scene, "t");
  h.emit("ready");
  await h.drain();
  h.writes.length = 0;
  let release;
  scene.beforeWrite = () => new Promise(resolve => { release = resolve; });
  h.update(actor, { portraitCustomImage: "first.webp" });
  await h.tick();
  h.update(actor, { portraitCustomImage: "latest.webp" });
  await h.tick();
  assert.equal(h.writes.length, 1);
  scene.beforeWrite = null;
  release();
  await setImmediate();
  await h.drain();
  assert.equal(token.texture.src, "latest.webp");
  assert.equal(h.writes.length, 2);
});

test("only the active GM writes when players or another GM change an actor", async () => {
  for (const userId of ["player", "other-gm", "gm"]) {
    const h = await setup({ userId });
    const actor = h.actor("a");
    h.token(actor, h.scene("one"), "t");
    h.emit("ready");
    await h.drain();
    h.writes.length = 0;
    h.update(actor, { portraitCustomImage: "new.webp" });
    await h.drain();
    assert.equal(h.writes.length, userId === "gm" ? 1 : 0);
  }
});

test("without a GM only the initiating owner writes permitted tokens", async () => {
  const h = await setup({ userId: "player", gmId: null });
  const actor = h.actor("a");
  const scene = h.scene("one");
  const owned = h.token(actor, scene, "owned");
  const denied = h.token(actor, scene, "denied", { allowed: false });
  h.emit("ready");
  h.update(actor, { portraitCustomImage: "other.webp" }, undefined, "other-player");
  await h.drain();
  assert.equal(h.writes.length, 0);
  h.update(actor, { portraitCustomImage: "owned.webp" });
  await h.drain();
  assert.equal(owned.texture.src, "owned.webp");
  assert.equal(denied.texture.src, "old.webp");
  actor.isOwner = false;
  h.update(actor, { portraitCustomImage: "forbidden.webp" });
  await h.drain();
  assert.equal(h.writes.length, 1);
});

test("flag deletions, flattened updates, and configured system images are detected", async () => {
  const h = await setup();
  const actor = h.actor("a", { portraitCustomImage: "custom.webp" }, "");
  actor.system = { image: "system.webp" };
  const token = h.token(actor, h.scene("one"), "t");
  h.emit("ready");
  await h.drain();
  const variants = [
    { flags: { [MODULE_ID]: { "-=portraitCustomImage": null } } },
    { [`flags.${MODULE_ID}.-=portraitCustomImage`]: null },
    { [`flags.${MODULE_ID}`]: { "-=portraitCustomImage": null } },
    { flags: { [`-=${MODULE_ID}`]: null } },
    { flags: { otherModule: {} }, [`flags.${MODULE_ID}.-=portraitCustomImage`]: null }
  ];
  for (const diff of variants) {
    actor.flags[MODULE_ID].portraitCustomImage = "";
    token.texture.src = "custom.webp";
    h.update(actor, {}, diff);
    await h.drain();
    assert.equal(token.texture.src, "system.webp");
  }
  h.update(actor, { portraitCustomImage: "flat.webp" }, {
    flags: { otherModule: {} }, [`flags.${MODULE_ID}.portraitCustomImage`]: "flat.webp"
  });
  await h.drain();
  assert.equal(token.texture.src, "flat.webp");
  actor.flags[MODULE_ID].portraitCustomImage = "";
  actor.system.image = "new-system.webp";
  h.update(actor, {}, { system: { image: "new-system.webp" } });
  await h.drain();
  assert.equal(token.texture.src, "new-system.webp");
});

test("editing the active custom emotion updates art and an empty image is not written", async () => {
  const h = await setup();
  const actor = h.actor("a", { portraitEmotion: "custom_0", customEmotions: [{ imagePath: "one.webp" }] });
  const token = h.token(actor, h.scene("one"), "t");
  h.emit("ready");
  await h.drain();
  h.update(actor, { customEmotions: [{ imagePath: "edited.webp" }] });
  await h.drain();
  assert.equal(token.texture.src, "edited.webp");
  actor.img = "";
  actor.prototypeToken.texture.src = "";
  h.update(actor, { customEmotions: [] });
  await h.drain();
  assert.equal(token.texture.src, "edited.webp");
});

test("dynamic ring subjects update without changing ring settings or token transforms", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const ring = { enabled: true, effects: 7, subject: { texture: "old-subject.webp", scale: 1.3 } };
  const token = h.token(actor, h.scene("one"), "t", { image: "base.webp", ring });
  h.emit("ready");
  await h.drain();
  assert.deepEqual(h.writes[0].updates, [{ _id: "t", "ring.subject.texture": "base.webp" }]);
  assert.deepEqual(h.writes[0].options, {
    animate: true, animation: { duration: 320, transition: "fade" }
  });
  assert.equal(token.ring.effects, 7);
  assert.equal(token.ring.subject.scale, 1.3);
  h.update(actor, { portraitEmotion: "joy" });
  await h.drain();
  assert.equal(h.writes.length, 1);
});

test("token art fades use the live emotion transition duration without changing dimensions", async () => {
  const h = await setup({ transitionMs: 640 });
  const actor = h.actor("a");
  h.token(actor, h.scene("one"), "t");
  h.emit("ready");
  await h.drain();
  assert.deepEqual(h.writes[0].options, {
    animate: true, animation: { duration: 640, transition: "fade" }
  });
  assert.deepEqual(h.writes[0].updates, [{ _id: "t", "texture.src": "base.webp" }]);
  h.settings.emotionImageTransitionMs = 180;
  h.update(actor, { portraitCustomImage: "new.webp" });
  await h.drain();
  assert.equal(h.writes[1].options.animation.duration, 180);
  h.settings.emotionImageTransitionMs = 0;
  h.update(actor, { portraitCustomImage: "instant.webp" });
  await h.drain();
  assert.deepEqual(h.writes[2].options, { animate: false });
});

test("invalid animation durations disable transitions; oversized durations are bounded", async () => {
  for (const [transitionMs, expected] of [[-1, null], [NaN, null], [Infinity, null], [9000, 2000]]) {
    const h = await setup({ transitionMs });
    const actor = h.actor("a");
    h.token(actor, h.scene("one"), "t");
    h.emit("ready");
    await h.drain();
    assert.deepEqual(h.writes[0].options, expected === null ? { animate: false } : {
      animate: true, animation: { duration: expected, transition: "fade" }
    });
  }
});

test("an active native fade does not cause duplicate art writes", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const token = h.token(actor, h.scene("one"), "t", {
    ring: { enabled: true, subject: { texture: "old.webp" } }
  });
  token._source = {
    texture: { src: "base.webp" },
    ring: { enabled: true, subject: { texture: "base.webp" } }
  };
  h.emit("ready");
  h.update(actor, { portraitEmotion: "joy" });
  await h.drain();
  assert.equal(h.writes.length, 0);
});

test("new linked tokens receive art before creation and unlinked tokens are untouched", async () => {
  const h = await setup();
  const actor = h.actor("a", { portraitCustomImage: "current.webp" });
  h.emit("ready");
  await h.drain();
  const scene = h.scene("one");
  const token = h.token(actor, scene, "t", { persisted: false });
  const unlinked = h.token(actor, scene, "u", { persisted: false, linked: false });
  h.emit("preCreateToken", token);
  h.emit("preCreateToken", unlinked);
  assert.equal(token.texture.src, "current.webp");
  assert.equal(unlinked.texture.src, "old.webp");
  scene.tokens.set(token.id, token);
  h.emit("createToken", token, {}, "player");
  await h.drain();
  assert.equal(h.writes.length, 0);
});

test("linking an existing token synchronizes it; synthetic actors and deleted tokens are ignored", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const scene = h.scene("one");
  const token = h.token(actor, scene, "t", { linked: false });
  h.emit("ready");
  await h.drain();
  token.actorLink = true;
  h.emit("updateToken", token, { actorLink: true }, {}, "player");
  await h.drain();
  assert.equal(token.texture.src, "base.webp");
  h.emit("updateActor", { ...actor, isToken: true }, { img: "synthetic.webp" }, {}, "player");
  h.update(actor, { portraitCustomImage: "next.webp" });
  scene.tokens.delete(token.id);
  await h.drain();
  assert.equal(h.writes.length, 1);
});

test("disabling cancels queued work and prevents writes to later scenes in flight", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const one = h.scene("one");
  const two = h.scene("two");
  h.token(actor, one, "a");
  const second = h.token(actor, two, "b");
  h.emit("ready");
  h.toggle(false);
  await h.drain();
  assert.equal(h.writes.length, 0);
  let release;
  one.beforeWrite = () => new Promise(resolve => { release = resolve; });
  h.toggle(true);
  await h.tick();
  h.toggle(false);
  release();
  await setImmediate();
  await h.drain();
  assert.equal(h.writes.length, 1);
  assert.equal(second.texture.src, "old.webp");
});

test("a failed scene write does not block other scenes or future changes", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const one = h.scene("one");
  one.failure = Error("Permission changed during request");
  const failed = h.token(actor, one, "a");
  const succeeded = h.token(actor, h.scene("two"), "b");
  h.emit("ready");
  await h.drain();
  assert.equal(h.warnings.length, 1);
  assert.equal(succeeded.texture.src, "base.webp");
  one.failure = null;
  h.update(actor, { portraitCustomImage: "recovered.webp" });
  await h.drain();
  assert.equal(failed.texture.src, "recovered.webp");
  assert.equal(succeeded.texture.src, "recovered.webp");
});

test("GM handoff drops queued work on the old authority and reconciles on the new one", async () => {
  const h = await setup();
  const actor = h.actor("a");
  const token = h.token(actor, h.scene("one"), "t");
  h.emit("ready");
  h.game.users.activeGM = { id: "other-gm" };
  await h.drain();
  assert.equal(h.writes.length, 0);
  h.game.user = { id: "other-gm", isGM: true };
  h.emit("userConnected", { id: "gm", isGM: true }, false);
  await h.drain();
  assert.equal(token.texture.src, "base.webp");
});
