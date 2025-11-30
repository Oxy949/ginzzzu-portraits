import { MODULE_ID, FLAG_PORTRAIT_EMOTION, FLAG_SHOW_STANDARD_EMOTIONS, FLAG_CUSTOM_EMOTIONS, EMOTION_COLORS, EMOTIONS, EMOTION_MOTIONS } from "../core/constants.js";


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

    /**
   * Стандартные варианты цветокора — по встроенным эмоциям.
   * Используется конфигом портрета, чтобы давать кастомным эмоциям
   * готовые пресеты цвета от Joy/Anger/Sad/... .
   */
  function _getStandardEmotionColorOptions() {
    return Object.values(EMOTION_COLORS).map(c => ({
      key: c.key,
      label: c.label
    }));
  }

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

  function _shouldShowStandardEmotions(actor) {
    if (!actor) return true;
    const raw = foundry.utils.getProperty(actor, FLAG_SHOW_STANDARD_EMOTIONS);
    // По умолчанию — показываем стандартные эмоции.
    // Только явный false скрывает их.
    return raw !== false;
  }


  /**
   * Get all emotions (built-in + custom) for an actor
   */
  function _getAllEmotionsForActor(actor) {
    const allEmotions = {};

    const showStandard = _shouldShowStandardEmotions(actor);
    if (showStandard) {
      // Все стандартные эмоции из EMOTIONS (включая "none")
      for (const [key, preset] of Object.entries(EMOTIONS)) {
        allEmotions[key] = {
          key: preset.key,
          label: preset.label,
          emoji: preset.emoji,
          // новые поля: ключи цветов/движений
          colorKey: preset.colorKey,
          motionKey: preset.motionKey,
          // legacy-поля — чтобы остальной код не ломать
          colorIntensity: preset.colorKey || "none",
          animation: preset.motionKey || "none",
          imagePath: null,
          isCustom: false
        };
      }
    } else {
      // Если стандартные выключены — оставляем только "none"
      const preset = EMOTIONS.none;
      allEmotions.none = {
        key: preset.key,
        label: preset.label,
        emoji: preset.emoji,
        colorKey: preset.colorKey,
        motionKey: preset.motionKey,
        colorIntensity: preset.colorKey || "none",
        animation: preset.motionKey || "none",
        imagePath: null,
        isCustom: false
      };
    }

    // Кастомные эмоции с актёра
    if (!actor) return allEmotions;

    try {
      const customEmotions = foundry.utils.getProperty(actor, FLAG_CUSTOM_EMOTIONS) || [];
      console.log(`[${MODULE_ID}] Loading custom emotions for ${actor.name}:`, customEmotions);

      if (Array.isArray(customEmotions)) {
        customEmotions.forEach((custom, idx) => {
          const key = `custom_${idx}`;

          // colorIntensity у кастомных эмоций теперь = ключ пресета цвета
          const colorKey = String(custom.colorIntensity || "none");
          const motionKey = String(custom.animation || "none");

          allEmotions[key] = {
            key,
            label: custom.name || `Custom ${idx}`,
            emoji: custom.emoji || "•",
            imagePath: custom.imagePath || null,
            isCustom: true,
            colorKey,
            motionKey,
            // legacy:
            colorIntensity: colorKey,
            animation: motionKey
          };
        });
      }
    } catch (e) {
      console.error(`[${MODULE_ID}] Error loading custom emotions:`, e);
    }

    return allEmotions;
  }

  /**
   * A small helper function to build the emoji labels.  Separated to take out of the template and in case a fallback is needed,
   * e.g. if it ever becomes worth it to show the hard coded label if no translation is found.
   * @param {string} label - they key to pass to internatonalization.
   * @returns the internationalized string
   */
  function _i18nEmoji(label) {
    return game.i18n.localize(`GINZZZUPORTRAITS.PortraitToolbar.${label}`);
  }


  function _buildEmotionToolbarHTML(actor) {
    const allEmotions = _getAllEmotionsForActor(actor);
    return Object
      .keys(allEmotions)
      .filter(k => k !== "none")
      .map(key => {
        const e = allEmotions[key];
        return `
          <button class="threeo-emo-btn" data-emo="${e.key}" title="${_i18nEmoji(e.label)}">
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

    // 1) Снимаем все старые emo-* классы (и цвет, и движение)
    for (const cls of Array.from(wrap.classList)) {
      if (cls.startsWith("emo-")) {
        wrap.classList.remove(cls);
      }
    }

    const allEmotions = _getAllEmotionsForActor(actor);
    const def = allEmotions[emoKey] || allEmotions.none || {
      key: "none",
      colorKey: "none",
      motionKey: "none"
    };

    // -------------------------
    // 2) ЦВЕТ (emo-XXX-color)
    // -------------------------
    let colorKey = def.colorKey || def.colorIntensity || "none";
    if (!EMOTION_COLORS[colorKey]) {
      // Старые значения вроде "high/medium" нам не подходят — просто не красим
      colorKey = "none";
    }

    if (colorKey !== "none") {
      const colorDef = EMOTION_COLORS[colorKey];
      const colorClass = colorDef.className || `emo-${colorKey}-color`;
      if (colorClass) {
        wrap.classList.add(colorClass);
      }
    }

    // -------------------------
    // 3) ДВИЖЕНИЕ (emo-XXX-motion)
    // -------------------------
    let motionKey = def.motionKey || def.animation || "none";
    let cssAnimKey = "none";

    const motionDef = EMOTION_MOTIONS[motionKey];
    if (motionDef) {
      const motionClass =
        motionDef.className || (motionKey !== "none" ? `emo-${motionKey}-motion` : "");
      if (motionClass) {
        wrap.classList.add(motionClass);
      }
      cssAnimKey = motionDef.value || motionDef.cssVar || "none";
    } else if (motionKey && motionKey !== "none") {
      // На всякий случай: неизвестный ключ — считаем, что это имя @keyframes
      wrap.classList.add("emo-custom-motion");
      cssAnimKey = motionKey;
    }

    // Переменная с именем keyframes
    if (cssAnimKey && cssAnimKey !== "none") {
      wrap.style.setProperty("--emotion-animation", String(cssAnimKey));
    } else {
      wrap.style.removeProperty("--emotion-animation");
    }


    // -------------------------
    // 4) Интенсивность цвета
    // -------------------------
    const intensityValue = _getColorIntensityValue();
    wrap.style.setProperty("--threeo-emo-intensity", String(intensityValue));

    // -------------------------
    // 5) Подсветка активной кнопки
    // -------------------------
    _syncToolbarActive(wrap, def.key);
  }


  function _getColorIntensityValue() {
    return _getColorIntensity();
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
      // Если панель недоступна — убираем
      bar?.remove();
    } else {
      // Панель должна быть — создаём при необходимости
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "threeo-emo-toolbar";
        wrap.appendChild(bar);

        // Делегированный клик по кнопкам эмоций
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

      
      // 🔧 КЛЮЧЕВАЯ СТРОКА: всегда пересобираем список эмоций
      bar.innerHTML = _buildEmotionToolbarHTML(actor);
      
      // Конфиг портрета — только для ГМа
      if (game.user.isGM) {
        const configBtn = document.createElement("button");
        configBtn.classList.add("threeo-emo-btn", "threeo-emo-config");
        configBtn.innerHTML = `<span class="threeo-emo-emoji"><i class="fas fa-user-edit"></i></span>`;

        configBtn.title = game.i18n.localize("GINZZZUPORTRAITS.PortraitToolbar.portraitSettings");

        configBtn.onclick = (ev) => {
          ev.stopPropagation();
          try {
            globalThis.GinzzzuPortraits.configurePortrait(ev, actor.sheet);
          } catch (err) {
            console.error("Portrait config error:", err);
          }
        };

        bar.appendChild(configBtn);
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
    
    const hasEmotionChange        = foundry.utils.hasProperty(diff, FLAG_PORTRAIT_EMOTION);
    const hasCustomEmotionsChange = foundry.utils.hasProperty(diff, FLAG_CUSTOM_EMOTIONS);
    const hasShowStandardChange   = foundry.utils.hasProperty(diff, FLAG_SHOW_STANDARD_EMOTIONS);
    
    if (hasEmotionChange) {
      console.log(`[${MODULE_ID}] Emotion changed for ${actor.name}`);
      applyEmotionToHudDom(actor.id);
    }
    
    // Refresh toolbar if changed
    if (hasCustomEmotionsChange || hasShowStandardChange) {
      console.log(`[${MODULE_ID}] Emotions config changed for ${actor.name}, refreshing toolbars`);
      refreshAllHudToolbars();
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
    refreshAllHudToolbars,
    getStandardEmotionColorOptions: _getStandardEmotionColorOptions
  };
})();
