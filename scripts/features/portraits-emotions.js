import { MODULE_ID, FLAG_PORTRAIT_EMOTION, FLAG_CUSTOM_EMOTIONS, ANIMATION_TYPES, COLOR_INTENSITY_OPTIONS } from "../core/constants.js";

/**
 * Общая логика панели эмоций для HUD-портретов.
 * Флаги те же, что и у free-слоя: flags.<systemId>.portraitEmotion
 */
(() => {
  // Встроенные эмоции
  const EMO = {
    none:  { key:"none",  label:"None", emoji:"✖", className:"", animation: "none", colorIntensity: "high" },
    joy:   { key:"joy",   label:"Joy",    emoji:"😊", className:"emo-joy", animation: "bob", colorIntensity: "high" },
    anger: { key:"anger", label:"Anger",   emoji:"😠", className:"emo-anger", animation: "shake", colorIntensity: "high" },
    sad:   { key:"sad",   label:"Sad",     emoji:"😢", className:"emo-sad", animation: "sag", colorIntensity: "high" },
    love:  { key:"love",  label:"Love",   emoji:"💖", className:"emo-love", animation: "beat", colorIntensity: "high" },
    fear:  { key:"fear",  label:"Fear",      emoji:"😱", className:"emo-fear", animation: "shiver", colorIntensity: "high" },
    tired: { key:"tired", label:"Tired",  emoji:"😪", className:"emo-tired", animation: "tired", colorIntensity: "high" },
    hurt:  { key:"hurt",  label:"Hurt",       emoji:"🤕", className:"emo-hurt", animation: "pulse", colorIntensity: "high" }
  };

  function _getVisibilityMode() {
    try {
      return game.settings.get(MODULE_ID, "emotionPanelVisibility") || "gm";
    } catch {
      return "gm";
    }
  }

  function _getScale() {
    try {
      const v = Number(game.settings.get(MODULE_ID, "emotionPanelScale"));
      if (Number.isFinite(v)) return Math.max(0.6, Math.min(1.6, v));
    } catch {}
    return 1;
  }

  function _getColorIntensity() {
    try {
      const v = Number(game.settings.get(MODULE_ID, "emotionColorIntensity"));
      if (Number.isFinite(v)) return Math.max(0, Math.min(1, v));
    } catch {}
    return 1;
  }

  function _getPosition() {
    try {
      const raw = String(game.settings.get(MODULE_ID, "emotionPanelPosition") || "top");
      if (raw === "left" || raw === "right" || raw === "top") return raw;
    } catch {}
    return "top";
  }

  function _canUseToolbar(actor) {
    if (!actor) return false;
    const mode = _getVisibilityMode();
    if (mode === "none") return false;

    const user = game.user;
    if (!user) return false;

    if (user.isGM) {
      return mode === "gm" || mode === "all";
    }

    if (mode !== "all") return false;
    return !!actor.isOwner;
  }

  /**
   * Get all emotions (built-in + custom) for an actor
   */
  function _getAllEmotionsForActor(actor) {
    if (!actor) return EMO;

    // Start with built-in emotions
    const allEmotions = { ...EMO };

    // Add custom emotions
    try {
      const customEmotions = foundry.utils.getProperty(actor, FLAG_CUSTOM_EMOTIONS) || [];
      if (Array.isArray(customEmotions)) {
        customEmotions.forEach((custom, idx) => {
          // Create unique key for custom emotion
          const key = `custom_${idx}`;
          allEmotions[key] = {
            key,
            label: custom.name || `Custom ${idx}`,
            emoji: custom.emoji || "•",
            className: "",
            animation: custom.animation || "none",
            colorIntensity: custom.colorIntensity || "high",
            imagePath: custom.imagePath || null,
            isCustom: true
          };
        });
      }
    } catch (e) {
      console.error(`[${MODULE_ID}] Error loading custom emotions:`, e);
    }

    return allEmotions;
  }

  function _buildEmotionToolbarHTML(actor) {
    const allEmotions = _getAllEmotionsForActor(actor);
    return Object
      .keys(allEmotions)
      .filter(k => k !== "none")
      .map(key => {
        const e = allEmotions[key];
        return `
          <button class="threeo-emo-btn" data-emo="${e.key}" title="${e.label}">
            <span class="threeo-emo-emoji">${e.emoji}</span>
          </button>
        `;
      })
      .join("");
  }

  function _syncToolbarActive(wrap, emoKey) {
    if (!wrap) return;
    const bar = wrap.querySelector(".threeo-emo-toolbar");
    if (!bar) return;
    for (const btn of bar.querySelectorAll(".threeo-emo-btn")) {
      btn.classList.toggle("is-active", btn.dataset.emo === emoKey);
    }
  }

  function _applyEmotionClasses(wrap, emoKey, actor) {
    if (!wrap) return;
    // сбрасываем старые emo-* классы
    for (const cls of Array.from(wrap.classList)) {
      if (cls.startsWith("emo-")) wrap.classList.remove(cls);
    }

    const allEmotions = _getAllEmotionsForActor(actor);
    const def = allEmotions[emoKey] || allEmotions.none;
    if (def.className) {
      wrap.classList.add(def.className);
    }

    // Apply animation and color intensity
    if (def.animation && def.animation !== "none") {
      wrap.style.setProperty("--emotion-animation", `${def.animation}`);
    } else {
      wrap.style.removeProperty("--emotion-animation");
    }

    if (def.colorIntensity && def.colorIntensity !== "high") {
      const intensityValue = _getColorIntensityValue(def.colorIntensity);
      wrap.style.setProperty("--threeo-emo-intensity", String(intensityValue));
    }

    _syncToolbarActive(wrap, def.key);
  }

  function _getColorIntensityValue(intensityKey) {
    const option = COLOR_INTENSITY_OPTIONS.find(opt => opt.key === intensityKey);
    return option ? option.value : 1;
  }

  function _getActorEmotionKey(actor) {
    if (!actor) return "none";

    const raw = foundry.utils.getProperty(actor, FLAG_PORTRAIT_EMOTION);
    const key = raw == null ? "none" : String(raw);

    const allEmotions = _getAllEmotionsForActor(actor);
    return allEmotions[key] ? key : "none";
  }

  /**
   * Применить эмоцию к конкретному HUD-портрету (по actorId).
   */
  function applyEmotionToHudDom(actorId) {
    if (!actorId) return;
    const root = document.getElementById("ginzzzu-portrait-layer");
    if (!root) return;

    const wrap = root.querySelector(`.ginzzzu-portrait-wrapper[data-actor-id="${actorId}"]`);
    if (!wrap) return;

    const actor = game.actors?.get(actorId);
    const key = _getActorEmotionKey(actor);
    _applyEmotionClasses(wrap, key, actor);
  }

  /**
   * Подключить панель эмоций к уже созданному wrapper HUD-портрета.
   */
  function attachToolbarToHudWrapper(wrap, actorId) {
    if (!wrap || !actorId) return;

    const actor = game.actors?.get(actorId);
    const canUse = !!actor && _canUseToolbar(actor);

    let bar = wrap.querySelector(".threeo-emo-toolbar");
    if (!canUse) {
      bar?.remove();
    } else {
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "threeo-emo-toolbar";
        bar.innerHTML = _buildEmotionToolbarHTML(actor);
        wrap.appendChild(bar);

        bar.addEventListener("click", async ev => {
          const btn = ev.target.closest(".threeo-emo-btn");
          if (!btn) return;

          const clickedKey = String(btn.dataset.emo || "none");
          const currentKey = _getActorEmotionKey(actor);

          const nextKey = (clickedKey === currentKey) ? "none" : clickedKey;
          const allEmotions = _getAllEmotionsForActor(actor);
          const def = allEmotions[nextKey] || allEmotions.none;
          const newFlagValue = def.key === "none" ? null : def.key;

          _applyEmotionClasses(wrap, def.key, actor);

          try {
            await actor.update({
              [FLAG_PORTRAIT_EMOTION]: newFlagValue
            });
          } catch (e) {
            console.error("[GinzzzuPortraitEmotions] failed to update portraitEmotion", e);
          }
        });
      }
    }

    const pos = _getPosition();
    const scale = _getScale();

    wrap.classList.remove("threeo-emo-pos-top", "threeo-emo-pos-left", "threeo-emo-pos-right");
    wrap.classList.add(`threeo-emo-pos-${pos}`);

    wrap.style.setProperty("--threeo-emo-scale", String(scale));

    const intensity = _getColorIntensity();
    wrap.style.setProperty("--threeo-emo-intensity", String(intensity));
    if (intensity <= 0) {
      wrap.classList.add("threeo-emo-no-shadow");
    } else {
      wrap.classList.remove("threeo-emo-no-shadow");
    }

    const key = _getActorEmotionKey(actor);
    _applyEmotionClasses(wrap, key, actor);
  }

  function refreshAllHudToolbars() {
    const root = document.getElementById("ginzzzu-portrait-layer");
    if (!root) return;

    const wraps = Array.from(root.querySelectorAll(".ginzzzu-portrait-wrapper[data-actor-id]"));
    for (const wrap of wraps) {
      const actorId = wrap.dataset.actorId;
      attachToolbarToHudWrapper(wrap, actorId);
    }
  }

  // Реакция на изменение актёров
  Hooks.on("updateActor", (actor, diff, options, userId) => {
    if (!actor?.id) return;
    if (foundry.utils.hasProperty(diff, FLAG_PORTRAIT_EMOTION) || foundry.utils.hasProperty(diff, FLAG_CUSTOM_EMOTIONS)) {
      applyEmotionToHudDom(actor.id);
      // Refresh toolbar if custom emotions changed
      if (foundry.utils.hasProperty(diff, FLAG_CUSTOM_EMOTIONS)) {
        refreshAllHudToolbars();
      }
    }
  });

  // Реакция на изменения настроек панели
  Hooks.on("updateSetting", setting => {
    if (!setting?.key?.startsWith?.(`${MODULE_ID}.`)) return;

    const localKey = setting.key.slice(MODULE_ID.length + 1);

    if (
      localKey === "emotionPanelVisibility" ||
      localKey === "emotionPanelScale" ||
      localKey === "emotionPanelPosition" ||
      localKey === "emotionColorIntensity"
    ) {
      refreshAllHudToolbars();
    }
  });

  // Экспорт простого API для других модулей
  globalThis.GinzzzuPortraitEmotions = {
    attachToolbarToHudWrapper,
    applyEmotionToHudDom,
    refreshAllHudToolbars
  };
})();
