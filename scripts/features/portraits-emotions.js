import { MODULE_ID, FLAG_PORTRAIT_EMOTION } from "../core/constants.js";

/**
 * Общая логика панели эмоций для HUD-портретов.
 * Флаги те же, что и у free-слоя: flags.<systemId>.portraitEmotion
 */
(() => {
  // Должно совпадать с EMO из threeO-portraits-free.js
  const EMO = {
    none:  { key:"none",  label:"None", emoji:"✖", className:"" },
    joy:   { key:"joy",   label:"Joy",    emoji:"😊", className:"emo-joy" },
    anger: { key:"anger", label:"Anger",   emoji:"😠", className:"emo-anger" },
    sad:   { key:"sad",   label:"Sad",     emoji:"😢", className:"emo-sad" },
    love:  { key:"love",  label:"Love",   emoji:"💖", className:"emo-love" },
    fear:  { key:"fear",  label:"Fear",      emoji:"😱", className:"emo-fear" },
    tired: { key:"tired", label:"Tired",  emoji:"😪", className:"emo-tired" },
    hurt:  { key:"hurt",  label:"Hurt",       emoji:"🤕", className:"emo-hurt" }
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
      // ГМ может всегда, если панель вообще включена
      return mode === "gm" || mode === "all";
    }

    // Игроки — только если разрешен режим gm+игроки и есть владение актёром
    if (mode !== "all") return false;
    return !!actor.isOwner;
  }

  function _buildEmotionToolbarHTML() {
    return Object
      .keys(EMO)
      .filter(k => k !== "none")
      .map(key => {
        const e = EMO[key];
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

  function _applyEmotionClasses(wrap, emoKey) {
    if (!wrap) return;
    // сбрасываем старые emo-* классы
    for (const cls of Array.from(wrap.classList)) {
      if (cls.startsWith("emo-")) wrap.classList.remove(cls);
    }

    const def = EMO[emoKey] || EMO.none;
    if (def.className) {
      wrap.classList.add(def.className);
    }
    _syncToolbarActive(wrap, def.key);
  }

    function _getActorEmotionKey(actor) {
    if (!actor) return "none";

    // безопасно читаем флаг модуля
    const raw = foundry.utils.getProperty(actor, FLAG_PORTRAIT_EMOTION);
    const key = raw == null ? "none" : String(raw);

    return EMO[key] ? key : "none";
    }


  /**
   * Применить эмоцию к конкретному HUD-портрету (по actorId).
   * Ищет .ginzzzu-portrait-wrapper с data-actor-id.
   */
  function applyEmotionToHudDom(actorId) {
    if (!actorId) return;
    const root = document.getElementById("ginzzzu-portrait-layer");
    if (!root) return;

    const wrap = root.querySelector(`.ginzzzu-portrait-wrapper[data-actor-id="${actorId}"]`);
    if (!wrap) return;

    const actor = game.actors?.get(actorId);
    const key = _getActorEmotionKey(actor);
    _applyEmotionClasses(wrap, key);
  }

  /**
   * Подключить панель эмоций к уже созданному wrapper HUD-портрета.
   * Вызывать из portraits.js при создании .ginzzzu-portrait-wrapper.
   */
  function attachToolbarToHudWrapper(wrap, actorId) {
    if (!wrap || !actorId) return;

    const actor = game.actors?.get(actorId);
    if (!actor || !_canUseToolbar(actor)) {
      // На всякий случай — убрать возможную старую панель
      wrap.querySelector(".threeo-emo-toolbar")?.remove();
      return;
    }

    // Если уже есть панель — просто обновим (не плодим копии)
    let bar = wrap.querySelector(".threeo-emo-toolbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "threeo-emo-toolbar";
      bar.innerHTML = _buildEmotionToolbarHTML();
      wrap.appendChild(bar);

        bar.addEventListener("click", async ev => {
        const btn = ev.target.closest(".threeo-emo-btn");
        if (!btn) return;

        // по какой эмоции кликнули
        const clickedKey = String(btn.dataset.emo || "none");
        // какая эмоция сейчас у актёра (из флага)
        const currentKey = _getActorEmotionKey(actor);

        // если кликнули по уже активной — снимаем эмоцию (становится "none")
        const nextKey = (clickedKey === currentKey) ? "none" : clickedKey;

        const def = EMO[nextKey] || EMO.none;
        const newFlagValue = def.key === "none" ? null : def.key;

        // МГНОВЕННЫЙ локальный отклик: классы + активная кнопка
        _applyEmotionClasses(wrap, def.key);

        try {
            // Аккуратно обновляем только наш флаг
            await actor.update({
            [FLAG_PORTRAIT_EMOTION]: newFlagValue
            });
        } catch (e) {
            console.error("[GinzzzuPortraitEmotions] failed to update portraitEmotion", e);
        }
        });
    }

    // Позиция и масштаб
    const pos = _getPosition();
    const scale = _getScale();

    wrap.classList.remove("threeo-emo-pos-top", "threeo-emo-pos-left", "threeo-emo-pos-right");
    wrap.classList.add(`threeo-emo-pos-${pos}`);

    // масштаб через CSS-переменную
    wrap.style.setProperty("--threeo-emo-scale", String(scale));

    // интенсивность цветового эффекта (0..1)
    const intensity = _getColorIntensity();
    wrap.style.setProperty("--threeo-emo-intensity", String(intensity));

    // начальная подсветка активной эмоции
    const key = _getActorEmotionKey(actor);
    _applyEmotionClasses(wrap, key);
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

  // Реакция на изменение актёров — обновляем эмоцию на HUD
  Hooks.on("updateActor", (actor, diff, options, userId) => {
    if (!actor?.id) return;
    if (foundry.utils.hasProperty(diff, FLAG_PORTRAIT_EMOTION)) {
      applyEmotionToHudDom(actor.id);
    }
  });

  // Реакция на изменения настроек панели — просто пересобрать всё
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
