import {
  MODULE_ID,
  FLAG_CUSTOM_EMOTIONS,
  FLAG_PORTRAIT_CUSTOM_IMAGE,
  FLAG_PORTRAIT_EMOTION
} from "../core/constants.js";
import {
  getActorPortraitImage,
  getActorPortraitImagePaths
} from "../core/portraitPresentation.js";

const SETTING = "syncTokenArt";
const IMAGE_FLAGS = [FLAG_PORTRAIT_EMOTION, FLAG_CUSTOM_EMOTIONS, FLAG_PORTRAIT_CUSTOM_IMAGE];
const BATCH_DELAY_MS = 50;
const pendingActors = new Map();
let enabled = false;
let flushTimer = null;
let flushing = false;

// Accept nested and flattened updates, including Foundry's -= deletion syntax.
function touchesPath(changes, path) {
  if (!changes || typeof changes !== "object") return true;
  const parts = path.split(".");
  for (let length = 1; length <= parts.length; length++) {
    const prefix = parts.slice(0, length).join(".");
    const deletion = [...parts.slice(0, length - 1), `-=${parts[length - 1]}`].join(".");
    if (Object.hasOwn(changes, deletion)) return true;
    if (!Object.hasOwn(changes, prefix)) continue;
    if (length === parts.length || touchesPath(changes[prefix], parts.slice(length).join("."))) return true;
  }
  return false;
}

function isSyncClient(actor, userId) {
  const activeGM = game.users.activeGM;
  if (activeGM) return activeGM.id === game.user?.id;
  return !!game.user && userId === game.user.id && actor.isOwner;
}

function queueActor(actor, userId) {
  if (!enabled || !actor?.id || actor.isToken || game.actors.get(actor.id) !== actor) return;
  if (!isSyncClient(actor, userId)) return;
  pendingActors.set(actor.id, { actor, userId });
  scheduleFlush();
}

function scheduleFlush() {
  // A fixed batching window bounds latency even when changes arrive continuously.
  if (!enabled || flushing || flushTimer !== null || !pendingActors.size) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushUpdates();
  }, BATCH_DELAY_MS);
}

function getTextureChanges(token, image) {
  const changes = {};
  // During a native transition the prepared document can still show the old art.
  // Compare the committed source to avoid sending the same update again.
  const source = token._source ?? token;
  if (source.texture?.src !== image) changes["texture.src"] = image;
  // An explicit ring subject would otherwise keep displaying the old artwork.
  if (source.ring?.enabled && source.ring.subject?.texture !== image) {
    changes["ring.subject.texture"] = image;
  }
  return changes;
}

function getUpdateOptions() {
  const duration = Number(game.settings.get(MODULE_ID, "emotionImageTransitionMs"));
  if (!Number.isFinite(duration) || duration <= 0) return { animate: false };
  // Let Foundry animate the texture (including ring subjects) on every client.
  // Native transitions preserve token geometry and other modules' mesh transforms.
  return { animate: true, animation: { duration: Math.min(duration, 2000), transition: "fade" } };
}

async function flushUpdates() {
  if (!enabled || flushing) return;
  flushing = true;
  const batch = Array.from(pendingActors.values());
  pendingActors.clear();

  try {
    const scenes = new Map();
    for (const entry of batch) {
      const { actor, userId } = entry;
      if (game.actors.get(actor.id) !== actor || !isSyncClient(actor, userId)) continue;

      // Foundry maintains this dependency index; no scan of world scenes/tokens.
      const tokens = actor.getDependentTokens({ linked: true, concreteOnly: true });
      for (const token of tokens) {
        const scene = token.parent;
        if (!scene || !token.actorLink || token.actorId !== actor.id) continue;
        let entries = scenes.get(scene);
        if (!entries) scenes.set(scene, entries = new Map());
        entries.set(token.id, { ...entry, token });
      }
    }

    for (const [scene, entries] of scenes) {
      if (!enabled) break;
      const updates = [];
      const images = new Map();
      for (const { actor, userId, token } of entries.values()) {
        if (!isSyncClient(actor, userId) || game.actors.get(actor.id) !== actor) continue;
        if (scene.tokens.get(token.id) !== token || !token.actorLink || token.actorId !== actor.id) continue;
        if (!images.has(actor.id)) images.set(actor.id, getActorPortraitImage(actor));
        const image = images.get(actor.id);
        if (!image) continue;
        const changes = getTextureChanges(token, image);
        if (!Object.keys(changes).length || !token.canUserModify(game.user, "update", changes)) continue;
        updates.push({ _id: token.id, ...changes });
      }
      if (!updates.length) continue;

      try {
        // Serialize batches so a slow earlier write cannot overwrite a newer art.
        await scene.updateEmbeddedDocuments("Token", updates, getUpdateOptions());
      } catch (error) {
        console.warn(`[${MODULE_ID}] Could not sync token art in scene ${scene.id}:`, error);
      }
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Token art synchronization failed:`, error);
  } finally {
    flushing = false;
    scheduleFlush();
  }
}

function queueExistingActors() {
  if (!enabled || game.users.activeGM?.id !== game.user?.id) return;
  for (const actor of game.actors) queueActor(actor);
}

Hooks.once("ready", () => {
  enabled = !!game.settings.get(MODULE_ID, SETTING);
  queueExistingActors();

  Hooks.on("updateSetting", setting => {
    if (setting.key !== `${MODULE_ID}.${SETTING}`) return;
    enabled = !!game.settings.get(MODULE_ID, SETTING);
    if (enabled) {
      queueExistingActors();
    } else {
      pendingActors.clear();
      if (flushTimer !== null) clearTimeout(flushTimer);
      flushTimer = null;
    }
  });

  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (!enabled || !actor?.id || !isSyncClient(actor, userId)) return;
    if (!changes || typeof changes !== "object") return;
    if (!IMAGE_FLAGS.some(path => touchesPath(changes, path)) &&
        !getActorPortraitImagePaths().some(path => touchesPath(changes, path))) return;
    queueActor(actor, userId);
  });

  // Set the image before creation, avoiding an extra write and a visible flash.
  Hooks.on("preCreateToken", token => {
    if (!enabled || !token.parent || !token.actorLink) return;
    const actor = game.actors.get(token.actorId);
    const image = getActorPortraitImage(actor);
    if (image) token.updateSource(getTextureChanges(token, image));
  });

  Hooks.on("createToken", (token, options, userId) => {
    if (enabled && token.actorLink) queueActor(game.actors.get(token.actorId), userId);
  });

  Hooks.on("updateToken", (token, changes, options, userId) => {
    if (!enabled || !token.actorLink) return;
    if (touchesPath(changes, "actorId") || touchesPath(changes, "actorLink")) {
      queueActor(game.actors.get(token.actorId), userId);
    }
  });

  // Reconcile missed changes when a GM connects or authority passes to another GM.
  Hooks.on("userConnected", user => {
    if (user.isGM) queueExistingActors();
  });
});
