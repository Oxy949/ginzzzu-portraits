import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import * as constants from "../scripts/core/constants.js";

const source = await readFile(new URL("../scripts/features/portrait-config.js", import.meta.url), "utf8");

test("saving portrait configuration emits one complete actor update, including resets", async () => {
  for (const reset of [false, true]) {
    let dialog; const writes = [];
    const actor = { name: "Actor", update: async changes => writes.push(changes),
      setFlag: async (module, key, value) => writes.push({ [key]: value }),
      unsetFlag: async (module, key) => writes.push({ [key]: null }) };
    const configure = vm.runInNewContext(`${source.replace(/^import .*;\r?$/gm, "").replace("export async function", "async function")}; configurePortrait`, {
      ...constants, game: { user: { isGM: true }, i18n: { localize: key => key, format: key => key } },
      foundry: { utils: { getProperty() {} } }, getCustomEmotions: () => [],
      window: { innerWidth: 1200 }, Hooks: { once() {} }, renderTemplate: async () => "",
      Dialog: class { constructor(options) { dialog = options; } render() {} }, console,
      $: element => element
    });
    const pending = configure(null, actor);
    await new Promise(resolve => setImmediate(resolve));
    const fields = { displayName: " New name ", portraitHeightMultiplier: "1.2", portraitBreathingMultiplier: "0.7", portraitCustomImage: " art.webp " };
    const html = { find(selector) {
      if (selector === ".ginzzzu-emotion-item") return { each() {} };
      return { val: () => reset ? "" : fields[/name="([^"]+)"/.exec(selector)[1]], is: () => !reset };
    } };
    await dialog.buttons.save.callback(html); await pending;
    assert.equal(writes.length, 1, "Saving configuration causes a burst of actor hooks and network writes");
    const update = writes[0];
    assert.equal(update[constants.FLAG_DISPLAY_NAME], reset ? null : "New name");
    assert.equal(update[constants.FLAG_PORTRAIT_CUSTOM_IMAGE], reset ? null : "art.webp");
    assert.equal(update[constants.FLAG_PORTRAIT_HEIGHT_MULTIPLIER], reset ? 0 : 1.2);
    assert.equal(update[constants.FLAG_PORTRAIT_BREATHING_MULTIPLIER], reset ? 0 : 0.7);
    assert.equal(update[constants.FLAG_SHOW_STANDARD_EMOTIONS], !reset);
    assert.deepEqual(Array.from(update[constants.FLAG_CUSTOM_EMOTIONS]), []);
  }
});
