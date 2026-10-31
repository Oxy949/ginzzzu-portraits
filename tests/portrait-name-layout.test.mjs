import assert from "node:assert/strict";
import test from "node:test";
import { layoutPortraitNames } from "../scripts/core/portraitNameLayout.js";

function scene(count, moving = []) {
  const events = [];
  const badges = Array.from({ length: count }, (_, index) => ({
    dataset: { actorId: String(index) },
    moving: moving.includes(index),
    style: new Proxy({}, {
      set(target, key, value) { events.push("write"); target[key] = value; return true; }
    })
  }));
  const wrappers = badges.map((badge, index) => ({
    dataset: badge.dataset,
    getBoundingClientRect() { events.push(`read:${index}`); return { left: index * 100, width: 100 }; },
    style: { getPropertyValue: key => key.endsWith("-top") ? "40vh" : "16px" }
  }));
  const container = {
    querySelectorAll: selector => selector.includes("-dragging") ? badges.filter(badge => badge.moving) : badges
  };
  const root = { querySelector: () => container, querySelectorAll: () => wrappers };
  return { root, events, badges };
}

test("many portraits are measured before name styles are changed", () => {
  const { root, events, badges } = scene(100);
  layoutPortraitNames(root);
  assert.equal(events.indexOf("write"), 100);
  assert.equal(events.slice(100).every(event => event === "write"), true);
  assert.equal(badges[0].style.left, "50px");
  assert.equal(badges[99].style.left, "9950px");
  assert.equal(badges[0].style.bottom, "calc(100vh - 40vh)");
  assert.equal(badges[0].style.fontSize, "16px");
  events.length = 0;
  layoutPortraitNames(root);
  assert.equal(events.some(event => event === "write"), false);
});

test("drag frames measure only moving portraits, regardless of the total count", () => {
  const { root, events, badges } = scene(200, [35]);
  layoutPortraitNames(root, { movingOnly: true });
  assert.deepEqual(events.filter(event => event.startsWith("read")), ["read:35"]);
  assert.equal(badges[35].style.left, "3550px");
  assert.equal(badges[34].style.left, undefined);
});

test("idle drag frames and missing name containers do not measure portraits", () => {
  const { root, events } = scene(200);
  layoutPortraitNames(root, { movingOnly: true });
  assert.equal(events.length, 0);
  layoutPortraitNames(null);
});
