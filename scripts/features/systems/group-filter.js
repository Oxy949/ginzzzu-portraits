export const GROUP_PREFIX = "group-";

export function addActorGroupOptions(sel, actorType) {
  const groups = (game.actors?.contents ?? []).filter(actor => actor.type === actorType);

  for (const group of groups) {
    const opt = document.createElement("option");
    opt.value = `${GROUP_PREFIX}${group.id}`;
    const groupLabel = game.i18n?.localize?.("GINZZZUPORTRAITS.groupPrefix") || "(Group)";
    opt.textContent = `${groupLabel} ${group.name}`;
    sel.appendChild(opt);
  }
}

export function getGroupFilterCriteria(folderSel) {
  const value = String(folderSel || "");
  return value.startsWith(GROUP_PREFIX) ? value.slice(GROUP_PREFIX.length) : undefined;
}

function getActorId(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  return value.id ?? value._id ?? value.actor?.id ?? value.actor?._id ?? null;
}

export function normalizeActorIdSet(members) {
  if (!members) return null;

  if (Array.isArray(members)) {
    return new Set(members.map(getActorId).filter(Boolean));
  }

  if (members instanceof Set) {
    return new Set(Array.from(members).map(getActorId).filter(Boolean));
  }

  if (members instanceof Map) {
    return new Set(
      Array.from(members.entries())
        .flatMap(([key, value]) => [getActorId(key), getActorId(value)])
        .filter(Boolean)
    );
  }

  if (typeof members === "object") {
    if (members.ids) return normalizeActorIdSet(members.ids);
    if (Array.isArray(members.contents)) return normalizeActorIdSet(members.contents);
    return new Set(Object.values(members).map(getActorId).filter(Boolean));
  }

  return null;
}

export function filterActorsByMemberIds(actors, members) {
  const idSet = normalizeActorIdSet(members);
  if (!idSet) return actors;
  if (!idSet.size) return [];
  return actors.filter(actor => idSet.has(actor.id));
}
