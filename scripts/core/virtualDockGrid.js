// The dock uses fixed-size, column-major CSS grid cells. Keep only the visible
// columns plus a small scroll buffer mounted, regardless of the actor count.
export function getDockGridWindow(count, rows, width, scrollLeft, size = 100, gap = 8, overscan = 2) {
  const columns = Math.ceil(count / rows);
  const totalWidth = columns ? columns * (size + gap) - gap : 0;
  const offset = Math.max(0, Math.min(scrollLeft, Math.max(0, totalWidth - width)));
  if (width <= 0) return { start: 0, end: 0, columns, offset };
  const first = Math.max(0, Math.floor(offset / (size + gap)) - overscan);
  const last = Math.min(columns, Math.ceil((offset + width) / (size + gap)) + overscan);
  return { start: first * rows, end: Math.min(count, last * rows), columns, offset };
}

export function createVirtualDockGrid(container, { createCard, getRows, size = 100, gap = 8, vertical = false }) {
  let items = [];
  let cards = new Map();
  let frame = null;
  let signature = "";
  const spacer = document.createElement("div");
  spacer.setAttribute("aria-hidden", "true");
  Object.assign(spacer.style, { gridRow: "1 / -1", height: "1px", pointerEvents: "none", visibility: "hidden" });

  function render() {
    frame = null;
    if (!items.length || container.querySelector("[data-dragging='1']")) return;
    const rows = getRows(items.length);
    if (vertical) container.style.gridTemplateColumns = `repeat(${rows}, ${size}px)`;
    const offsetProperty = vertical ? "scrollTop" : "scrollLeft";
    const window = getDockGridWindow(items.length, rows,
      vertical ? container.clientHeight : container.clientWidth, container[offsetProperty], size, gap);
    const nextSignature = `${window.start}:${window.end}:${rows}:${items.length}`;
    if (signature === nextSignature) return;
    signature = nextSignature;
    spacer.style.gridColumn = vertical ? "1 / -1" : `1 / span ${window.columns}`;
    spacer.style.gridRow = vertical ? `1 / span ${window.columns}` : "1 / -1";
    const mounted = [];
    const nextCards = new Map();
    for (let index = window.start; index < window.end; index++) {
      const actor = items[index];
      const card = cards.get(actor.id) ?? createCard(actor);
      card.style.gridColumn = String((vertical ? index % rows : Math.floor(index / rows)) + 1);
      card.style.gridRow = String((vertical ? Math.floor(index / rows) : index % rows) + 1);
      mounted.push(card);
      nextCards.set(actor.id, card);
    }
    cards = nextCards;
    // Keep cards first: the existing dock CSS uses :has(.item:nth-child(...))
    // to decide whether player/favorite panels are empty and how many columns fit.
    container.replaceChildren(...mounted, spacer);
    if (container[offsetProperty] !== window.offset) container[offsetProperty] = window.offset;
  }

  function schedule() {
    if (frame === null) frame = requestAnimationFrame(render);
  }
  const observer = new ResizeObserver(schedule);
  observer.observe(container);
  container.addEventListener("scroll", schedule, { passive: true });
  container.addEventListener("dragend", schedule);

  return {
    setItems(actors) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      items = actors;
      cards.clear();
      signature = "";
      if (vertical) container.style.display = items.length ? "grid" : "none";
      if (items.length) render();
      else container.replaceChildren();
    },
    refresh: schedule,
    destroy() {
      observer.disconnect();
      container.removeEventListener("scroll", schedule);
      container.removeEventListener("dragend", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      items = [];
      cards.clear();
      container.replaceChildren();
    }
  };
}
