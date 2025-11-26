/**
 * Custom emotions management module
 * Handles reading, writing, and validating custom emotions for actors
 */
import { MODULE_ID, FLAG_CUSTOM_EMOTIONS, EMOTION_MOTIONS } from "../core/constants.js";

/**
 * Get all custom emotions for an actor
 * @param {Actor} actor - The actor to get emotions for
 * @returns {Object[]} Array of custom emotion objects
 */
export function getCustomEmotions(actor) {
  if (!actor) {
    console.warn(`[${MODULE_ID}] getCustomEmotions called with null actor`);
    return [];
  }

  try {
    const emotions = actor.getFlag(MODULE_ID, "customEmotions");
    console.log(`[${MODULE_ID}] getCustomEmotions for ${actor.name}: found ${Array.isArray(emotions) ? emotions.length : 0} emotions`, emotions);
    if (Array.isArray(emotions)) {
      return emotions;
    }
  } catch (e) {
    console.error(`[${MODULE_ID}] Error getting custom emotions for ${actor.name}:`, e);
  }

  return [];
}

/**
 * Set custom emotions for an actor
 * @param {Actor} actor - The actor to set emotions for
 * @param {Object[]} emotions - Array of emotion objects to set
 * @returns {Promise<void>}
 */
export async function setCustomEmotions(actor, emotions) {
  if (!actor || !Array.isArray(emotions)) return;

  try {
    // Validate emotions before saving
    const validated = emotions.map(validateEmotion).filter(e => e !== null);
    await actor.setFlag(MODULE_ID, "customEmotions", validated);
    console.log(`[${MODULE_ID}] Custom emotions saved for ${actor.name}:`, validated);
  } catch (e) {
    console.error(`[${MODULE_ID}] Error setting custom emotions:`, e);
    throw e;
  }
}

/**
 * Add a new custom emotion to an actor
 * @param {Actor} actor - The actor to add emotion to
 * @param {Object} emotionData - { emoji, name, imagePath, animation, colorIntensity }
 * @returns {Promise<void>}
 */
export async function addCustomEmotion(actor, emotionData) {
  if (!actor) return;

  const emotions = getCustomEmotions(actor);
  const validated = validateEmotion(emotionData);
  if (validated) {
    emotions.push(validated);
    await setCustomEmotions(actor, emotions);
  }
}

/**
 * Remove a custom emotion from an actor by index
 * @param {Actor} actor - The actor to remove emotion from
 * @param {number} index - Index of emotion to remove
 * @returns {Promise<void>}
 */
export async function removeCustomEmotion(actor, index) {
  if (!actor) return;

  const emotions = getCustomEmotions(actor);
  if (index >= 0 && index < emotions.length) {
    emotions.splice(index, 1);
    await setCustomEmotions(actor, emotions);
  }
}

/**
 * Update a custom emotion at specific index
 * @param {Actor} actor - The actor to update emotion for
 * @param {number} index - Index of emotion to update
 * @param {Object} emotionData - Updated emotion data
 * @returns {Promise<void>}
 */
export async function updateCustomEmotion(actor, index, emotionData) {
  if (!actor) return;

  const emotions = getCustomEmotions(actor);
  if (index >= 0 && index < emotions.length) {
    const validated = validateEmotion(emotionData);
    if (validated) {
      emotions[index] = validated;
      await setCustomEmotions(actor, emotions);
    }
  }
}

/**
 * Validate and normalize emotion data
 * @param {Object} emotion - Emotion object to validate
 * @returns {Object|null} Validated emotion or null if invalid
 */
export function validateEmotion(emotion) {
  if (!emotion || typeof emotion !== "object") return null;

  const validated = {
    emoji: String(emotion.emoji || "").substring(0, 10).trim(),
    name: String(emotion.name || "").substring(0, 50).trim(),
    imagePath: String(emotion.imagePath || "").trim(),
    animation: String(emotion.animation || "none"),
    colorIntensity: String(emotion.colorIntensity || "high")
  };

  // Require at least emoji and name
  if (!validated.emoji || !validated.name) return null;

  // Validate animation type
  if (!EMOTION_MOTIONS[validated.animation]) {
    validated.animation = "none";
  }

  // Validate color intensity / preset key
  // Раньше здесь допускались только значения из COLOR_INTENSITY_OPTIONS
  // (low/medium/high). Теперь это поле может хранить и ключ стандартной
  // эмоции (joy/anger/sad/...), поэтому не трогаем любые непустые строки
  // и лишь подставляем значение по умолчанию, если оно пустое.
  if (!validated.colorIntensity) {
    validated.colorIntensity = "high";
  }


  return validated;
}

/**
 * Get animation type options for select dropdowns
 * @returns {Object[]} Array of animation options
 */
export function getAnimationOptions() {
  return Object.values(EMOTION_MOTIONS);
}

/**
 * Get key by label for animation type
 * @param {string} label - The label to search for
 * @returns {string} The animation key or "none"
 */
export function getAnimationKeyByLabel(label) {
  const option = Object.values(EMOTION_MOTIONS).find(opt => opt.label === label);
  return option ? option.key : "none";
}

// Export as global API
globalThis.GinzzzuCustomEmotions = {
  getCustomEmotions,
  setCustomEmotions,
  addCustomEmotion,
  removeCustomEmotion,
  updateCustomEmotion,
  validateEmotion,
  getAnimationOptions,
  getAnimationKeyByLabel
};
