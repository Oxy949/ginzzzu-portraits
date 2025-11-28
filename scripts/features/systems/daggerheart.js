export const PREFIX = "group-";

function addNpcDockOptions(sel) {
    const groups = (game.actors.contents ?? []).filter(a => a.type === 'party')    
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
        console.error(`[threeO-dock] no actor found for ${filterCriteria}`)
      } else {
        const containedActors = groupActor.system?.partyMembers;
        console.log("Contained actors:", containedActors);
        // TODO, should an empty list mean NO actors, or should it filter to no actors
        if (containedActors) {
          let idSet;
          if (Array.isArray(containedActors)) {
            idSet = new Set(containedActors.map(a => a?.id ?? a?._id).filter(Boolean));
          } else if (containedActors instanceof Set) {
            const first = containedActors.values().next().value;
            if (typeof first === 'string') {
              idSet = new Set(containedActors);
            } else {
              idSet = new Set(Array.from(containedActors).map(a => a?.id ?? a?._id).filter(Boolean));
            }
          } else if (containedActors instanceof Map) {
            idSet = new Set(Array.from(containedActors.keys()).filter(Boolean));
          } else if (typeof containedActors === 'object') {
            idSet = new Set(Object.values(containedActors).map(a => a?.id ?? a?._id).filter(Boolean));
          }

          if (idSet && idSet.size) {
            npcs = npcs.filter(a => idSet.has(a.id));
          }
        }
      }
      return npcs;
}

export default {
    addNpcDockOptions,
    getFilterCriteria,
    filterNpcs
}