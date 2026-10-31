import assert from "node:assert/strict";
import test from "node:test";
import { createVirtualDockGrid, getDockGridWindow } from "../scripts/core/virtualDockGrid.js";

test("visible windows stay bounded for thousands of actors and all dock row counts", () => {
  for (let rows = 1; rows <= 5; rows++) {
    for (const scrollLeft of [0, 103, 10000, 1e9]) {
      const window = getDockGridWindow(5000, rows, 432, scrollLeft);
      assert.ok(window.end - window.start <= 9 * rows);
      assert.ok(window.start >= 0 && window.end <= 5000);
      assert.equal(window.start % rows, 0);
    }
  }
  assert.equal(getDockGridWindow(5000, 2, 0, 0).end, 0);
  assert.deepEqual(getDockGridWindow(0, 1, 432, 200), { start: 0, end: 0, columns: 0, offset: 0 });
});

test("a filtered list clamps the scroll position and includes its last partial column", () => {
  const window = getDockGridWindow(7, 3, 100, 99999);
  assert.equal(window.end, 7);
  assert.equal(window.columns, 3);
  assert.equal(window.offset, 216);
});

function setup({ vertical = false } = {}) {
  const callbacks = new Map();
  let nextId = 0;
  let onResize;
  let disconnected = false;
  globalThis.document = { createElement: () => ({ style: {}, setAttribute() {} }) };
  globalThis.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = id => callbacks.delete(id);
  globalThis.ResizeObserver = class {
    constructor(callback) { onResize = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  };
  const handlers = new Map();
  const container = {
    clientWidth: 432, clientHeight: 112, scrollLeft: 0, scrollTop: 0, children: [], dragging: false, style: {},
    querySelector() { return this.dragging ? {} : null; },
    replaceChildren(...children) { this.children = children; },
    addEventListener: (name, callback) => handlers.set(name, callback),
    removeEventListener: name => handlers.delete(name)
  };
  let created = 0;
  let rows = 2;
  const grid = createVirtualDockGrid(container, {
    vertical, size: vertical ? 50 : 100, gap: vertical ? 6 : 8,
    getRows: () => rows,
    createCard: actor => { created++; return { style: {}, id: actor.id }; }
  });
  const actors = Array.from({ length: 5000 }, (_, i) => ({ id: String(i) }));
  const frame = () => {
    const pending = Array.from(callbacks.values());
    callbacks.clear();
    pending.forEach(callback => callback());
  };
  return { grid, container, actors, handlers, callbacks, frame, resize: () => onResize(),
    setRows: value => { rows = value; }, created: () => created, disconnected: () => disconnected };
}

test("scrolling reuses overlapping cards, coalesces events, and unmounts distant actors", () => {
  const h = setup();
  h.grid.setItems(h.actors);
  assert.equal(h.created(), 12);
  const firstCard = h.container.children[0];
  for (let i = 0; i < 20; i++) h.handlers.get("scroll")();
  assert.equal(h.callbacks.size, 1);
  h.frame();
  assert.equal(h.created(), 12);
  assert.equal(h.container.children[0], firstCard);
  h.container.scrollLeft = 1080;
  h.handlers.get("scroll")();
  h.frame();
  assert.ok(h.container.children.length <= 19);
  assert.equal(h.container.children.includes(firstCard), false);
  h.grid.setItems(h.actors.slice(0, 3));
  assert.equal(h.container.scrollLeft, 0);
  assert.equal(h.container.children.length, 4);
});

test("hidden panels create no cards and render the correct rows after expanding", () => {
  const h = setup();
  h.container.clientWidth = 0;
  h.grid.setItems(h.actors);
  assert.equal(h.created(), 0);
  h.setRows(3);
  h.container.clientWidth = 432;
  h.resize();
  h.frame();
  assert.equal(h.created(), 18);
  assert.equal(h.container.children[1].style.gridRow, "2");
  assert.equal(h.container.children[3].style.gridColumn, "2");
  h.grid.destroy();
  assert.equal(h.disconnected(), true);
  assert.equal(h.handlers.size, 0);
  assert.equal(h.callbacks.size, 0);
});

test("scrolling preserves the native drag source until the drag ends", () => {
  const h = setup();
  h.grid.setItems(h.actors);
  const card = h.container.children[0];
  h.container.dragging = true;
  h.container.scrollLeft = 1000;
  h.handlers.get("scroll")();
  h.frame();
  assert.equal(h.container.children[0], card);
  h.container.dragging = false;
  h.handlers.get("dragend")();
  h.frame();
  assert.equal(h.container.children.includes(card), false);
});

test("player and favorite grids window vertically and preserve their columns", () => {
  const h = setup({ vertical: true });
  h.grid.setItems(h.actors);
  assert.equal(h.container.style.display, "grid");
  assert.equal(h.container.style.gridTemplateColumns, "repeat(2, 50px)");
  assert.equal(h.created(), 8);
  assert.equal(h.container.children[1].style.gridColumn, "2");
  assert.equal(h.container.children[2].style.gridRow, "2");
  h.container.scrollTop = 5600;
  h.handlers.get("scroll")();
  h.frame();
  assert.ok(h.container.children.length <= 13);
  assert.ok(Number(h.container.children[0].id) > 100);
  h.grid.setItems([]);
  assert.equal(h.container.style.display, "none");
  assert.equal(h.container.children.length, 0);
});
