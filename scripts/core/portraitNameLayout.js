// Read all geometry before touching styles, avoiding a layout flush per portrait.
export function layoutPortraitNames(root, { movingOnly = false } = {}) {
  const container = root?.querySelector("#ginzzzu-portrait-names");
  if (!container) return;
  const selector = movingOnly
    ? ".ginzzzu-portrait-name-dragging, .ginzzzu-portrait-name-returning"
    : ".ginzzzu-portrait-name[data-actor-id]";
  const badges = new Map(Array.from(container.querySelectorAll(selector), badge => [badge.dataset.actorId, badge]));
  if (!badges.size) return;

  const positions = [];
  for (const wrapper of root.querySelectorAll(".ginzzzu-portrait-wrapper")) {
    const badge = badges.get(wrapper.dataset.actorId);
    if (!badge) continue;
    let left = null;
    try {
      const rect = wrapper.getBoundingClientRect();
      left = `${rect.left + rect.width / 2}px`;
    } catch (_) {}
    positions.push({
      badge, left,
      bottom: `calc(100vh - ${wrapper.style.getPropertyValue("--threeo-portrait-name-top") || "50vh"})`,
      fontSize: wrapper.style.getPropertyValue("--threeo-portrait-name-font-size")
    });
  }
  for (const { badge, left, bottom, fontSize } of positions) {
    if (left !== null && badge.style.left !== left) badge.style.left = left;
    if (badge.style.bottom !== bottom) badge.style.bottom = bottom;
    if (fontSize && badge.style.fontSize !== fontSize) badge.style.fontSize = fontSize;
  }
}
