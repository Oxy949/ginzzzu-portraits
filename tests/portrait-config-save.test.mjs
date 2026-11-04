import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import * as constants from "../scripts/core/constants.js";
import { normalizePortraitOffsetPercent } from "../scripts/core/portraitOffsets.js";
import { setCustomEmotions } from "../scripts/features/custom-emotions.js";

const source = await readFile(new URL("../scripts/features/portrait-config.js", import.meta.url), "utf8");

test("saving portrait configuration emits one complete actor update, including resets", async () => {
  for (const reset of [false, true]) {
    let dialog, rendered; const writes = [];
    const oldEmotions = [{ name: "Existing emotion" }];
    const actor = { name: "Actor", update: async changes => writes.push(changes),
      setFlag: async (module, key, value) => writes.push({ [key]: value }),
      unsetFlag: async (module, key) => writes.push({ [key]: null }) };
    const configure = vm.runInNewContext(`${source.replace(/^import .*;\r?$/gm, "").replace("export async function", "async function")}; configurePortrait`, {
      ...constants, game: { user: { isGM: true }, i18n: { localize: key => key, format: key => key } },
      foundry: { utils: { getProperty() {} } }, getCustomEmotions: () => oldEmotions,
      normalizePortraitOffsetPercent,
      window: { innerWidth: 1200 }, Hooks: { once() {} }, renderTemplate: async (_, data) => { rendered = data; return ""; },
      Dialog: class { constructor(options) { dialog = options; } render() {} }, console,
      $: element => element
    });
    const pending = configure(null, actor);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(rendered.portraitVerticalOffsetPercent, 0);
    assert.equal(rendered.emotions[0].verticalOffsetPercent, 0);
    assert.equal(oldEmotions[0].verticalOffsetPercent, undefined, "Opening settings modified stored emotions");
    const fields = { displayName: " New name ", portraitHeightMultiplier: "1.2", portraitVerticalOffsetPercent: "-24", portraitBreathingMultiplier: "0.7", portraitCustomImage: " art.webp " };
    const emotionFields = [
      { "emotion-name": "Rise", "emotion-vertical-offset": "120" },
      { "emotion-name": "Drop", "emotion-vertical-offset": "-35" },
      { "emotion-name": "Legacy" }
    ];
    const html = { find(selector) {
      if (selector === ".ginzzzu-emotion-item") return { each(callback) {
        if (!reset) emotionFields.forEach((fields, index) => callback(index, {
          find: selector => ({ val: () => fields[selector.split(".")[1]] })
        }));
      } };
      return { val: () => reset ? "" : fields[/name="([^"]+)"/.exec(selector)[1]], is: () => !reset };
    } };
    await dialog.buttons.save.callback(html); await pending;
    assert.equal(writes.length, 1, "Saving configuration causes a burst of actor hooks and network writes");
    const update = writes[0];
    assert.equal(update[constants.FLAG_DISPLAY_NAME], reset ? null : "New name");
    assert.equal(update[constants.FLAG_PORTRAIT_CUSTOM_IMAGE], reset ? null : "art.webp");
    assert.equal(update[constants.FLAG_PORTRAIT_HEIGHT_MULTIPLIER], reset ? 0 : 1.2);
    assert.equal(update[constants.FLAG_PORTRAIT_VERTICAL_OFFSET_PERCENT], reset ? 0 : -24);
    assert.equal(update[constants.FLAG_PORTRAIT_BREATHING_MULTIPLIER], reset ? 0 : 0.7);
    assert.equal(update[constants.FLAG_SHOW_STANDARD_EMOTIONS], !reset);
    assert.deepEqual(Array.from(update[constants.FLAG_CUSTOM_EMOTIONS], emotion => [emotion.name, emotion.verticalOffsetPercent]),
      reset ? [] : [["Rise", 100], ["Drop", -35], ["Legacy", 0]]);
  }
});

test("the custom emotion API preserves and bounds individual vertical offsets", async () => {
  let saved;
  await setCustomEmotions({ update: async changes => { saved = changes[constants.FLAG_CUSTOM_EMOTIONS]; } }, [
    { name: "Up", verticalOffsetPercent: 250 },
    { name: "Down", verticalOffsetPercent: -40 },
    { name: "Old emotion" }
  ]);
  assert.deepEqual(saved.map(emotion => emotion.verticalOffsetPercent), [100, -40, 0]);
});
