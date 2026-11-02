// Handle wheel input once, in capture phase, before Foundry's canvas handlers.
export function attachDockWheelScrolling(root) {
  const players = root.querySelector(".players");
  const favorites = root.querySelector(".npc-favs");
  const rail = root.querySelector(".npcs .rail");
  root.addEventListener("wheel", event => {
    const verticalTarget = [players, favorites].find(element => element?.contains(event.target));
    const target = verticalTarget || rail;
    if (!target) return;
    const property = verticalTarget ? "scrollTop" : "scrollLeft";
    let delta = verticalTarget ? event.deltaY : (event.deltaX || event.deltaY);
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= window.innerHeight;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    target[property] += delta;
  }, { passive: false, capture: true });
}
