import assert from "node:assert/strict";
import test from "node:test";
import { attachDockWheelScrolling } from "../scripts/core/dockWheel.js";

test("wheel input scrolls the intended panel exactly once, including child images and horizontal trackpads", () => {
  globalThis.window = { innerHeight: 800 };
  const panel = () => ({ scrollTop: 0, scrollLeft: 0, contains(target) { return target.panel === this; } });
  const players = panel(), favorites = panel(), rail = panel();
  const panels = { ".players": players, ".npc-favs": favorites, ".npcs .rail": rail };
  const listeners = [];
  attachDockWheelScrolling({
    querySelector: selector => panels[selector],
    addEventListener(name, callback, options) { listeners.push({ name, callback, options }); }
  });
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].options.capture, true);
  assert.equal(listeners[0].options.passive, false);
  function wheel(panel, deltaY, deltaMode = 0, deltaX = 0) {
    let prevented = 0, stopped = 0;
    listeners[0].callback({ target: { panel }, deltaY, deltaX, deltaMode,
      preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
    assert.equal(prevented, deltaY || deltaX ? 1 : 0);
    assert.equal(stopped, prevented, "Dock scrolling must not also reach Foundry's canvas");
  }
  wheel(players, 40);
  assert.equal(players.scrollTop, 40); assert.equal(rail.scrollLeft, 0);
  wheel(favorites, 3, 1);
  assert.equal(favorites.scrollTop, 48); assert.equal(players.scrollTop, 40);
  wheel(rail, 100);
  assert.equal(rail.scrollLeft, 100);
  wheel(rail, -25, 0, -60);
  assert.equal(rail.scrollLeft, 40);
  wheel(null, 1, 2); // Wheel over the toolbar still controls the NPC rail.
  assert.equal(rail.scrollLeft, 840);
  wheel(rail, 0);
  assert.equal(rail.scrollLeft, 840);
});
