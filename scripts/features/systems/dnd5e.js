export const PREFIX = "group-";

function addNpcDockOptions(sel) {
    const groups = (game.actors.contents ?? []).filter(a => a.type === 'group')    
    for (const g of groups) {
      const opt = document.createElement("option");
      opt.value = `${PREFIX}${g.id}`;
      opt.textContent = `(Group) ${g.name}`
      sel.appendChild(opt);
    }
}

function getFilterCriteria(folderSel) {
    return folderSel.startsWith(PREFIX) ? folderSel.substring(PREFIX.length) : undefined;
}

function filterNpcs(filterCriteria, npcs) {      
      const groupActor = game.actors.get(filterCriteria);
      if (!groupActor) {
        console.error("[threeO-dock] no actor found for ${filterCriteria}")
      } else {
        const containedActors = groupActor.system?.members?.ids;
        // TODO, should an empty list mean NO actors, or should it filter to no actors
        if (containedActors?.size) {
          npcs = npcs.filter(a => containedActors.has(a.id))
        }
      }
      return npcs;
}

export default {
    addNpcDockOptions,
    getFilterCriteria,
    filterNpcs
}