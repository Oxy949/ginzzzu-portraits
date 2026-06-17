import {
  GROUP_PREFIX,
  addActorGroupOptions,
  filterActorsByMemberIds,
  getGroupFilterCriteria
} from "./group-filter.js";

export const PREFIX = GROUP_PREFIX;

function addNpcDockOptions(sel) {
  addActorGroupOptions(sel, "party");
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

  const members = groupActor.system?.members || groupActor.system?.partyMembers || groupActor.members;
  return filterActorsByMemberIds(npcs, members);
}

export default {
  addNpcDockOptions,
  getFilterCriteria,
  filterNpcs
};
