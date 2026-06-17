import {
  GROUP_PREFIX,
  addActorGroupOptions,
  filterActorsByMemberIds,
  getGroupFilterCriteria
} from "./group-filter.js";

export const PREFIX = GROUP_PREFIX;

function addNpcDockOptions(sel) {
  addActorGroupOptions(sel, "group");
}

function getFilterCriteria(folderSel) {
  return getGroupFilterCriteria(folderSel);
}

function filterNpcs(filterCriteria, npcs) {
  const groupActor = game.actors.get(filterCriteria);
  if (!groupActor) {
    console.error(`[threeO-dock] no actor found for ${filterCriteria}`);
    return npcs;
  }

  return filterActorsByMemberIds(npcs, groupActor.system?.members?.ids);
}

export default {
  addNpcDockOptions,
  getFilterCriteria,
  filterNpcs
};
