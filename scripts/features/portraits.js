import { MODULE_ID, FLAG_MODULE, FLAG_PORTRAIT_SHOWN, FLAG_CUSTOM_EMOTIONS, FLAG_DISPLAY_NAME, FLAG_PORTRAIT_EMOTION, FLAG_PORTRAIT_HEIGHT_MULTIPLIER, FLAG_EMOTION_HEIGHT_MULTIPLIER, FLAG_PORTRAIT_CUSTOM_IMAGE, FLAG_SHOW_STANDARD_EMOTIONS, EMOTIONS } from "../core/constants.js";
import { configurePortrait } from "./portrait-config.js";


var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

(()=>{
  // Preferable actor image property paths (configurable)
  function _parsePathsCSV(v) {
    return String(v ?? "").split(",").map(s => s.trim()).filter(Boolean);
  }
  function _getActorBaseImage(actor) {
    if (!actor) return "";
    try {
      const csv = game.settings.get(MODULE_ID, "actorImagePaths"); // CSV of dot-paths
      const paths = _parsePathsCSV(csv);
      for (const path of paths) {
        const v = foundry.utils.getProperty(actor, path);
        if (typeof v === "string" && v) return v;
      }
    } catch {}
    // Fallbacks
    return actor.img || actor.prototypeToken?.texture?.src || actor?.texture?.src || "";
  }

  /**
   * Get current portrait image for actor, taking into account custom emotions.
   * If a custom emotion with a non-empty imagePath is active, that path overrides the base image.
   * If no emotion is active, the custom portrait image (if set) overrides the base image.
   */
  function _getActorImage(actor) {
    if (!actor) return "";

    // 1) Базовая картинка по стандартным правилам
    const baseImg = _getActorBaseImage(actor);

    // 2) Пытаемся переопределить её картинкой кастомной эмоции (если есть)
    try {
      // Текущий ключ эмоции для актёра (например "joy", "custom_0", "none")
      const rawKey = foundry.utils.getProperty(actor, FLAG_PORTRAIT_EMOTION);
      const emoKey = rawKey == null ? "none" : String(rawKey);

      // Интересуют только custom_* эмоции
      const m = /^custom_(\d+)$/.exec(emoKey);
      if (!m) {
        // Нет активной кастомной эмоции, проверяем кастомное изображение портрета
        const customPortraitImg = foundry.utils.getProperty(actor, FLAG_PORTRAIT_CUSTOM_IMAGE);
        if (typeof customPortraitImg === "string" && customPortraitImg.trim().length > 0) {
          return customPortraitImg.trim();
        }
        return baseImg;
      }

      const idx = Number(m[1]);
      if (!Number.isInteger(idx) || idx < 0) {
        // Кастомная эмоция не найдена, используем кастомное изображение портрета если есть
        const customPortraitImg = foundry.utils.getProperty(actor, FLAG_PORTRAIT_CUSTOM_IMAGE);
        if (typeof customPortraitImg === "string" && customPortraitImg.trim().length > 0) {
          return customPortraitImg.trim();
        }
        return baseImg;
      }

      const customEmotions = foundry.utils.getProperty(actor, FLAG_CUSTOM_EMOTIONS) || [];
      if (!Array.isArray(customEmotions) || !customEmotions[idx]) {
        // Кастомная эмоция не найдена, используем кастомное изображение портрета если есть
        const customPortraitImg = foundry.utils.getProperty(actor, FLAG_PORTRAIT_CUSTOM_IMAGE);
        if (typeof customPortraitImg === "string" && customPortraitImg.trim().length > 0) {
          return customPortraitImg.trim();
        }
        return baseImg;
      }

      const path = customEmotions[idx]?.imagePath;
      if (typeof path === "string" && path.trim().length > 0) {
        return path.trim();
      }

      // Кастомная эмоция активна, но без картинки - используем кастомное изображение портрета если есть
      const customPortraitImg = foundry.utils.getProperty(actor, FLAG_PORTRAIT_CUSTOM_IMAGE);
      if (typeof customPortraitImg === "string" && customPortraitImg.trim().length > 0) {
        return customPortraitImg.trim();
      }
    } catch (e) {
      console.error("[threeO-portraits] Failed to resolve custom emotion image:", e);
    }

    return baseImg;
  }

  // ---- Adaptive tone (по темноте сцены) ----
function _toneClamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function _toneSmoothstep(edge0, edge1, value) {
  const t = _toneClamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - (2 * t));
}

function _toneRound(value) {
  return Number(value.toFixed(4));
}

function _toneCompute(darkness, strength01) {
  const d = _toneClamp01(darkness);
  const s = _toneClamp01(strength01);

  const dusk = _toneSmoothstep(0.12, 0.70, d) * s;
  const night = _toneSmoothstep(0.55, 1.00, d) * s;
  const deepNight = _toneSmoothstep(0.78, 1.00, d) * s;

  const brightness = 1 - (0.20 * dusk) - (0.16 * night) - (0.04 * deepNight);
  const contrast = 1 + (0.08 * dusk) - (0.03 * deepNight);
  const saturate = 1 - (0.04 * dusk) - (0.08 * night);
  const hueDeg = (-2 * dusk) - (10 * night);
  const blueTint = (0.03 * dusk) + (0.10 * night) + (0.04 * deepNight);

  return {
    brightness: _toneRound(brightness),
    contrast: _toneRound(contrast),
    saturate: _toneRound(saturate),
    hueDeg: _toneRound(hueDeg),
    blueTint: _toneRound(blueTint),
    bluePostHueDeg: _toneRound(hueDeg - 180)
  };
}

function _toneGetDarknessLevel() {
  const readNumber = (getter) => {
    try {
      const value = getter();
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
    } catch (e) {
      return null;
    }
  };

  const candidates = [
    () => canvas?.darknessLevel,
    () => canvas?.environment?.darknessLevel,
    () => canvas?.scene?.environment?.darknessLevel,
    () => canvas?.scene?.environment?.darkness,
    () => canvas?.scene?.darkness
  ];

  for (const getter of candidates) {
    const darkness = readNumber(getter);
    if (darkness !== null) return darkness;
  }

  return 0;
}

function _toneApplyToRootVars(root = document.getElementById("ginzzzu-portrait-layer")) {
  const enabled = game.settings.get(MODULE_ID, "portraitToneEnabled");
  if (!root) return;
  if (!enabled) {
    root.style.removeProperty("--tone-brightness");
    root.style.removeProperty("--tone-contrast");
    root.style.removeProperty("--tone-saturate");
    root.style.removeProperty("--tone-hue");
    root.style.removeProperty("--tone-blue-tint");
    root.style.removeProperty("--tone-blue-post-hue");
    return;
  }
  const strength = Math.max(0, Math.min(1, Number(game.settings.get(MODULE_ID, "portraitToneStrength")) || 0));
  const d = _toneGetDarknessLevel();
  const { brightness, contrast, saturate, hueDeg, blueTint, bluePostHueDeg } = _toneCompute(d, strength);
  root.style.setProperty("--tone-brightness", String(brightness));
  root.style.setProperty("--tone-contrast",   String(contrast));
  root.style.setProperty("--tone-saturate",   String(saturate));
  root.style.setProperty("--tone-hue",        `${hueDeg}deg`);
  root.style.setProperty("--tone-blue-tint",  String(blueTint));
  root.style.setProperty("--tone-blue-post-hue", `${bluePostHueDeg}deg`);
}

  // ---- Геометрия «рамки» портретов и анимации ----
const FRAME = {
  heightVh: 80,     // фикс. высота рамки
  widthVw: 50,      // желаемая ширина рамки
  minWidthPx: 160,
  maxWidthPx: 520,
  targetBand: 0.98, // используем 98% ширины экрана (чтоб максимум места)
  gapBase: 24,
  gapMin: 8,

  bottomPx: 4,      // ← отступ от нижней кромки ЭКРАНА (сделай 0–8px)
  sidePadPx: 8      // ← небольшой боковой запас, чтобы точно не «липло» к краю
};


  const ANIM = {
    get fadeMs() {
      return game.settings.get(MODULE_ID, "portraitFadeMs");
    },
    get moveMs() {
      return game.settings.get(MODULE_ID, "portraitMoveMs");
    },
    get easing() {
      return game.settings.get(MODULE_ID, "portraitEasing");
    }
  };

  // Wrap ANIM getters so they respect reduced motion
  const _ANIM = {
    get fadeMs() { return ANIM.fadeMs; },
    get moveMs() { return ANIM.moveMs; },
    get easing()  { return ANIM.easing ?? "ease"; }
  };

  const isGM = () => !!game.user?.isGM;
  let _blurRemovalTimeout = null;

  function isPortraitUiHidden(root = document.getElementById("ginzzzu-portrait-layer")) {
    return !!root?.classList?.contains("ginzzzu-portrait-ui-hidden");
  }

  function clearPortraitBlur(root = document.getElementById("ginzzzu-portrait-layer")) {
    if (!root) return;

    if (_blurRemovalTimeout !== null) {
      clearTimeout(_blurRemovalTimeout);
      _blurRemovalTimeout = null;
    }

    root.classList.remove("ginzzzu-portrait-blur-active", "ginzzzu-portrait-focus-blur-active");
    root.style.removeProperty("--ginzzzu-blur-strength-value");
    root.style.removeProperty("--ginzzzu-blur-speed-value");
  }

  function setPortraitUiHidden(root, hidden) {
    if (!root) return;

    root.classList.toggle("ginzzzu-portrait-ui-hidden", !!hidden);

    if (hidden) {
      root.querySelectorAll("#ginzzzu-portrait-names .ginzzzu-portrait-name.visible").forEach((badge) => {
        badge.classList.remove("visible");
      });
      clearPortraitBlur(root);
      return;
    }

    if (getActivePortraits().length > 0) {
      _applyPortraitFocus();
    }
  }

  // Simple image preloader with timeout
  function _preloadImage(src, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      if (!src) return reject(new Error("No src"));
      const img = new Image();
      let done = false;
      const onDone = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        if (err) reject(err); else resolve(src);
      };
      img.onload = () => {
        if (typeof img.decode === "function") {
          img.decode().catch(() => {}).then(() => onDone());
        } else {
          onDone();
        }
      };
      img.onerror = (e) => onDone(new Error("Image load error"));
      // try set crossOrigin to allow CORS'd images where possible
      try { img.crossOrigin = "anonymous"; } catch {}
      img.src = src;
      const timer = setTimeout(() => onDone(new Error("Image preload timeout")), timeoutMs);
    });
  }

  function runWhenBrowserIdle(callback, timeout = 600) {
    if (typeof globalThis.requestIdleCallback === "function") {
      globalThis.requestIdleCallback(callback, { timeout });
    } else {
      setTimeout(callback, 0);
    }
  }

  function scheduleAfterAnimationSettles(durationMs, callback, settleMs = 180) {
    const delay = Math.max(0, Number(durationMs) || 0) + Math.max(0, Number(settleMs) || 0);
    setTimeout(() => runWhenBrowserIdle(callback), delay);
  }

  // ---- DOM HUD внутри #interface ----
  function getDomHud() {
    // Check if portraits are disabled for this client
    if (game.settings.get(MODULE_ID, "hidePortraits")) {
      return null;
    }

    let root = document.getElementById("ginzzzu-portrait-layer");
    if (root) {
      return root;
    }

    const iface = document.getElementById("interface");
    if (!iface) {
      console.warn("[threeO-portraits] #interface not found; abort DOM HUD");
      return null;
    }

    root = document.createElement("div");
    root.id = "ginzzzu-portrait-layer";

    const nameMode = game.settings.get(MODULE_ID, "portraitNamesAlwaysVisible") || "hover";

    // Класс для режима "всегда показывать имена"
    if (nameMode === "always") {
      root.classList.add("ginzzzu-show-names-always");
    }

    // слой на весь интерфейс; flex-ряд у низа по центру
    Object.assign(root.style, {
      position: "absolute",
      inset: "0",
      zIndex: "1",
      pointerEvents: "none",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "center",
      gap: "24px",
      paddingBottom: `${getBottomOffsetPx()}px`,  // ← берём из настройки
      // paddingLeft/Right будут синхронизироваться ниже с учётом #sidebar
      transform: "translateZ(0)", // Force GPU layer
      backfaceVisibility: "hidden"
    });

    const rail = document.createElement("div");
    rail.id = "ginzzzu-portrait-rail";
    if (game.settings.get(MODULE_ID, "visualNovelMode")) {
      Object.assign(rail.style, {
        position: "absolute",
        left: "0",
        right: "0",
        top: "0",
        bottom: `${getBottomOffsetPx()}px`,
        display: "flex",
        flexDirection: "row",
        alignItems: "end",
        justifyContent: "center",        // центрируем ряд; отступы делаем через margin
        gap: "inherit",
        pointerEvents: "none",
        overflowX: "hidden",              // не скроллить — будем сжимать/перекрывать
        overflowY: "hidden",
        WebkitOverflowScrolling: "auto",
        transform: "translateZ(0)", // Force GPU layer
        backfaceVisibility: "hidden",
        // paddingLeft/Right будут синхронизироваться ниже с учётом #sidebar
      });
    } else {
      Object.assign(rail.style, {
        position: "absolute",
        left: "0",
        right: "0",
        top: "0",
        bottom: `${getBottomOffsetPx()}px`,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",        // центрируем ряд; отступы делаем через margin
        gap: "inherit",
        pointerEvents: "none",
        overflowX: "hidden",              // не скроллить — будем сжимать/перекрывать
        overflowY: "hidden",
        WebkitOverflowScrolling: "auto",
        transform: "translateZ(0)", // Force GPU layer
        backfaceVisibility: "hidden",
        // paddingLeft/Right будут синхронизироваться ниже с учётом #sidebar
      });
    }
    root.appendChild(rail);

    // Names container: badges live here so they can float above portrait wrappers
    let namesContainer = document.getElementById("ginzzzu-portrait-names");
    if (!namesContainer) {
      namesContainer = document.createElement("div");
      namesContainer.id = "ginzzzu-portrait-names";
      Object.assign(namesContainer.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        zIndex: "100000"
      });
      root.appendChild(namesContainer);
    }

    // Установить paddingLeft/paddingRight с учётом ширины #sidebar
    syncSidePadding(root, rail);

    // === Toggle button: allow players & GM to hide portrait UI (make semi-transparent + disable clicks) ===
    try {
      // Check visibility setting: all, players, gm, or none
      const visibility = game.settings.get(MODULE_ID, 'portraitUIToggleVisibility') || 'all';
      const isGMUser = !!game.user?.isGM;
      let shouldShow = false;

      if (visibility === 'all') {
        shouldShow = true;
      } else if (visibility === 'players') {
        shouldShow = !isGMUser;
      } else if (visibility === 'gm') {
        shouldShow = isGMUser;
      }
      // 'none' means shouldShow stays false

      // if (!shouldShow) {
      //   return; // Don't create button if user shouldn't see it
      // }

      const toggleId = 'ginzzzuPortraitsUiHidden';
      const btn = document.createElement('button');
      btn.id = 'ginzzzu-portrait-ui-toggle-btn';
      if (!shouldShow) {
        btn.className = 'hidden';
      }
      btn.setAttribute('aria-pressed', 'false');
      const toggleLabel = game.i18n?.localize('GINZZZUPORTRAITS.PortraitUIToggle.togglePortraitUI') || 'Toggle portrait UI';
      btn.title = toggleLabel;
      btn.innerHTML = '<i class="fas fa-eye-slash" aria-hidden="true"></i>';
      // ensure it's clickable even when root has pointer-events none
      btn.style.pointerEvents = 'auto';

      function updateToggleButtonIcon(el, hidden) {
        try {
          el.setAttribute('aria-pressed', hidden ? 'true' : 'false');
          const hideLabel = game.i18n?.localize('GINZZZUPORTRAITS.PortraitUIToggle.hideUI') || 'Hide portrait UI';
          const showLabel = game.i18n?.localize('GINZZZUPORTRAITS.PortraitUIToggle.showUI') || 'Show portrait UI';
          el.title = hidden ? showLabel : hideLabel;
          el.innerHTML = hidden ? '<i class="fas fa-eye" aria-hidden="true"></i>' : '<i class="fas fa-eye-slash" aria-hidden="true"></i>';
        } catch (e) {}
      }

      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
          const isHidden = !isPortraitUiHidden(root);
          setPortraitUiHidden(root, isHidden);
          updateToggleButtonIcon(btn, isHidden);
        } catch (e) { console.error('[ginzzzu-portraits] toggle button error:', e); }
      }, { passive: true });

      try { localStorage.removeItem(toggleId); } catch (e) {}
      setPortraitUiHidden(root, false);
      updateToggleButtonIcon(btn, false);

      // Add button to root so it's positioned relative to portrait layer
      root.appendChild(btn);
    } catch (e) {
      console.warn('[ginzzzu-portraits] failed to create UI toggle button:', e);
    }

    _toneApplyToRootVars(root);
    document.getElementById("interface").appendChild(root);
    return root;
  }

    // Position all name badges to match their wrappers; called after layout changes
    function updateNamePositions() {
      const root = getDomHud();
      if (!root) return;
      const namesContainer = root.querySelector('#ginzzzu-portrait-names');
      if (!namesContainer) return;

      const wrappers = Array.from(root.querySelectorAll('.ginzzzu-portrait-wrapper'));
      const badgesByActorId = new Map(
        Array.from(namesContainer.querySelectorAll('.ginzzzu-portrait-name[data-actor-id]'))
          .map(badge => [badge.dataset.actorId, badge])
      );
      for (const wrapper of wrappers) {
        const actorId = wrapper.dataset.actorId;
        if (!actorId) continue;
        const badge = badgesByActorId.get(actorId);
        if (!badge) continue;
        // Horizontal: center above wrapper
        try {
          const rect = wrapper.getBoundingClientRect();
          const centerX = rect.left + (rect.width / 2);
          badge.style.left = `${centerX}px`;
        } catch (e) {}

        // Vertical placement: try to reuse wrapper variable if present
        const nameTopVar = wrapper.style.getPropertyValue('--threeo-portrait-name-top') || '50vh';
        // badge bottom should equal calc(100vh - nameTopVar)
        badge.style.bottom = `calc(100vh - ${nameTopVar})`;

        // font-size propagation
        const fontSize = wrapper.style.getPropertyValue('--threeo-portrait-name-font-size');
        if (fontSize) badge.style.fontSize = fontSize;
      }
    }

  // Получить ширину правой панели (если есть)
  function getSidebarWidth() {
    if (!game.settings.get(MODULE_ID, "adjustForSidebar"))
      return 0;
    try {
      const sb = document.getElementById("sidebar");
      if (!sb) return 0;
      const r = sb.getBoundingClientRect();
      return Math.max(0, Math.round(r.width || 0));
    } catch (e) { return 0; }
  }

  // Синхронизировать правый отступ root/rail с текущей шириной sideBar
  function syncSidePadding(root, rail) {
    const sidebarW = getSidebarWidth();
    const leftPad = FRAME.sidePadPx;
    const rightPad = FRAME.sidePadPx + sidebarW;
    if (root) {
      root.style.paddingLeft = `${leftPad}px`;
      root.style.paddingRight = `${rightPad}px`;
    }
    if (rail) {
      rail.style.paddingLeft = `${leftPad}px`;
      rail.style.paddingRight = `${rightPad}px`;
    }
  }

  function getBottomOffsetPx() {
    try {
      let v = Number(game.settings.get(MODULE_ID, "portraitBottomOffset") ?? 0);
      if (!Number.isFinite(v)) v = 0;
      return Math.max(0, v);
    } catch (e) {
      // fallback на значение из FRAME, если что-то пошло не так
      return FRAME.bottomPx ?? 0;
    }
  }

  // Кэш DOM-элементов: actorId -> <img>
  function domStore() {
    if (!globalThis.__ginzzzuDomPortraits) globalThis.__ginzzzuDomPortraits = new Map();
    return globalThis.__ginzzzuDomPortraits;
  }

  const PORTRAIT_DRAG = {
    startThresholdPx: 6,
    detachRatio: 0.22,
    minDetachPx: 44,
    maxTiltDeg: 9,
    targetBufferRatio: 0.08,
    minScale: 0.55,
    maxScale: 1.85,
    maxManualTiltDeg: 45,
    wheelScaleSpeed: 0.00075,
    pointerScaleSpeed: 0.004,
    pointerRotateSpeedDeg: 0.18
  };

  let activePortraitDrag = null;
  let pendingSharedPortraitSequence = null;
  let namePositionFrame = null;
  let nameFollowUntil = 0;
  let lastPortraitDragSocketAt = 0;
  const remotePortraitDrags = new Map();
  const portraitManualTransforms = new Map();
  const portraitManualZIndexes = new Map();
  let portraitManualZCounter = 200000;

  function scheduleNamePositionsUpdate() {
    if (namePositionFrame !== null) return;
    namePositionFrame = requestAnimationFrame(() => {
      namePositionFrame = null;
      try { updateNamePositions(); } catch (e) {}
      const root = getDomHud();
      const now = performance?.now?.() ?? Date.now();
      if (
        now < nameFollowUntil ||
        root?.querySelector?.(".ginzzzu-portrait-name-dragging, .ginzzzu-portrait-name-returning")
      ) {
        scheduleNamePositionsUpdate();
      }
    });
  }

  function followNamePositionsFor(durationMs = 0) {
    const now = performance?.now?.() ?? Date.now();
    nameFollowUntil = Math.max(nameFollowUntil, now + Math.max(0, Number(durationMs) || 0));
    scheduleNamePositionsUpdate();
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function clampPortraitTilt(value) {
    const tilt = Number(value);
    if (!Number.isFinite(tilt)) return 0;
    return clampNumber(tilt, -PORTRAIT_DRAG.maxManualTiltDeg, PORTRAIT_DRAG.maxManualTiltDeg);
  }

  function getPortraitRail(root = getDomHud()) {
    if (!root) return null;
    return root.querySelector("#ginzzzu-portrait-rail") || root;
  }

  function shouldIgnorePortraitDragTarget(target) {
    if (!target?.closest) return false;
    return !!target.closest(".threeo-emo-toolbar, button, input, select, textarea, a, [data-no-portrait-drag]");
  }

  function updatePortraitReorderCursor(wrapper, actorId = wrapper?.dataset?.actorId) {
    if (!wrapper) return;
    wrapper.classList.toggle("ginzzzu-portrait-reorderable", canUserReorderPortrait(actorId, game.user));
  }

  function getPortraitNameBadge(actorId, root = getDomHud()) {
    if (!actorId || !root) return null;
    const namesContainer = root.querySelector("#ginzzzu-portrait-names");
    return namesContainer?.querySelector?.(`.ginzzzu-portrait-name[data-actor-id="${actorId}"]`) || null;
  }

  function getPortraitDragActor(actorId) {
    if (!actorId) return null;
    try { return game.actors?.get(actorId) || null; } catch (e) { return null; }
  }

  function getUserById(userOrId = game.user) {
    if (!userOrId) return null;
    if (typeof userOrId !== "string") return userOrId;
    try { return game.users?.get(userOrId) || null; } catch (e) { return null; }
  }

  function getPortraitDragAccessMode() {
    try {
      return game.settings.get(MODULE_ID, "portraitDragAccess") || "all";
    } catch (e) {
      return "all";
    }
  }

  function isPortraitDragSyncEnabled() {
    try {
      return game.settings.get(MODULE_ID, "portraitDragAnimate") !== false;
    } catch (e) {
      return true;
    }
  }

  function shouldResetPortraitDragPositionOnRelease() {
    try {
      return game.settings.get(MODULE_ID, "portraitDragResetOnRelease") !== false;
    } catch (e) {
      return true;
    }
  }

  function normalizePortraitManualTransform(transform) {
    const x = Number(transform?.x ?? 0);
    const y = Number(transform?.y ?? 0);
    const tilt = Number(transform?.tilt ?? 0);
    const scale = Number(transform?.scale ?? 1);
    return {
      x: Number.isFinite(x) ? Math.round(x) : 0,
      y: Number.isFinite(y) ? Math.round(y) : 0,
      tilt: Number.isFinite(tilt) ? Math.round(clampPortraitTilt(tilt) * 100) / 100 : 0,
      scale: Number.isFinite(scale)
        ? Math.round(clampNumber(scale, PORTRAIT_DRAG.minScale, PORTRAIT_DRAG.maxScale) * 1000) / 1000
        : 1
    };
  }

  function isZeroPortraitManualTransform(transform) {
    const normalized = normalizePortraitManualTransform(transform);
    return normalized.x === 0 && normalized.y === 0 && normalized.tilt === 0 && normalized.scale === 1;
  }

  function getPortraitManualTransform(actorId) {
    return normalizePortraitManualTransform(portraitManualTransforms.get(actorId));
  }

  function getAppliedPortraitManualTransform(wrapper, actorId = wrapper?.dataset?.actorId) {
    const x = Number(wrapper?.dataset?.manualTransformX);
    const y = Number(wrapper?.dataset?.manualTransformY);
    const tilt = Number(wrapper?.dataset?.manualTransformTilt);
    const scale = Number(wrapper?.dataset?.manualTransformScale);
    if (Number.isFinite(x) || Number.isFinite(y) || Number.isFinite(tilt) || Number.isFinite(scale)) {
      return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        tilt: Number.isFinite(tilt) ? tilt : 0,
        scale: Number.isFinite(scale) ? scale : 1
      };
    }
    return getPortraitManualTransform(actorId);
  }

  function getPortraitLayerZIndex(actorId, fallback = "") {
    const zIndex = portraitManualZIndexes.get(actorId);
    return Number.isFinite(zIndex) ? String(zIndex) : fallback;
  }

  function setPortraitManualZIndex(actorId, zIndex = null, { root = getDomHud() } = {}) {
    const id = String(actorId || "").trim();
    if (!id) return null;

    let z = Number(zIndex);
    if (!Number.isFinite(z)) z = ++portraitManualZCounter;
    portraitManualZCounter = Math.max(portraitManualZCounter, z);
    portraitManualZIndexes.set(id, z);

    const wrapper = getWrapperByActorId(id, root);
    if (wrapper && !wrapper.classList.contains("ginzzzu-portrait-focused")) {
      wrapper.style.zIndex = String(z);
    }
    return z;
  }

  function applyPortraitManualTransform(actorId, transform, {
    root = getDomHud(),
    scheduleNames = true,
    animate = false
  } = {}) {
    const id = String(actorId || "").trim();
    if (!id) return;

    const normalized = normalizePortraitManualTransform(transform);
    if (isZeroPortraitManualTransform(normalized)) portraitManualTransforms.delete(id);
    else portraitManualTransforms.set(id, normalized);

    const wrapper = getWrapperByActorId(id, root);
    if (!wrapper) return;

    wrapper.dataset.manualTransformX = String(normalized.x);
    wrapper.dataset.manualTransformY = String(normalized.y);
    wrapper.dataset.manualTransformTilt = String(normalized.tilt);
    wrapper.dataset.manualTransformScale = String(normalized.scale);

    if (animate) {
      wrapper.style.transition = `transform ${_ANIM.moveMs}ms ${_ANIM.easing}`;
      void wrapper.offsetWidth;
    }

    if (isZeroPortraitManualTransform(normalized)) {
      wrapper.style.removeProperty("--ginzzzu-manual-x");
      wrapper.style.removeProperty("--ginzzzu-manual-y");
      wrapper.style.removeProperty("--ginzzzu-manual-tilt");
      wrapper.style.removeProperty("--ginzzzu-manual-scale");
    } else {
      wrapper.style.setProperty("--ginzzzu-manual-x", `${normalized.x}px`);
      wrapper.style.setProperty("--ginzzzu-manual-y", `${normalized.y}px`);
      wrapper.style.setProperty("--ginzzzu-manual-tilt", `${normalized.tilt}deg`);
      wrapper.style.setProperty("--ginzzzu-manual-scale", String(normalized.scale));
    }

    if (scheduleNames) {
      if (animate) {
        const delay = Math.max(0, Number(_ANIM.moveMs) || 0) + 80;
        followNamePositionsFor(delay);
        setTimeout(() => scheduleNamePositionsUpdate(), delay);
      } else {
        scheduleNamePositionsUpdate();
      }
    }
  }

  function getPortraitDragFinalManualTransform(state) {
    const base = normalizePortraitManualTransform(state?.manualTransform);
    return normalizePortraitManualTransform({
      x: base.x + (Number(state?.lastDx) || 0),
      y: base.y + (Number(state?.lastDy) || 0) + (Number(state?.lastLift) || 0),
      tilt: base.tilt + (Number(state?.lastTilt) || 0),
      scale: base.scale * (Number(state?.dragScale) || 1)
    });
  }

  function getPortraitDragFinalScale(state) {
    const base = normalizePortraitManualTransform(state?.manualTransform);
    return clampNumber(
      base.scale * (Number(state?.dragScale) || 1),
      PORTRAIT_DRAG.minScale,
      PORTRAIT_DRAG.maxScale
    );
  }

  function setPortraitDragFinalScale(state, finalScale) {
    if (!state) return;
    const base = normalizePortraitManualTransform(state.manualTransform);
    const nextFinalScale = clampNumber(
      Number(finalScale),
      PORTRAIT_DRAG.minScale,
      PORTRAIT_DRAG.maxScale
    );
    state.dragScale = nextFinalScale / Math.max(0.001, base.scale);
  }

  function getPortraitAutoTiltForX(x, width) {
    return clampNumber(
      ((Number(x) || 0) / Math.max(1, Number(width) || 1)) * PORTRAIT_DRAG.maxTiltDeg,
      -PORTRAIT_DRAG.maxTiltDeg,
      PORTRAIT_DRAG.maxTiltDeg
    );
  }

  function getPortraitDragTiltOffset(state) {
    if (Number.isFinite(Number(state?.dragTiltOffset))) return Number(state.dragTiltOffset);

    const base = normalizePortraitManualTransform(state?.manualTransform);
    const width = state?.startRect?.width || 1;
    return clampPortraitTilt(base.tilt) - getPortraitAutoTiltForX(base.x, width);
  }

  function setPortraitDragFinalTilt(state, finalTilt, dx = state?.lastDx || 0) {
    if (!state) return;

    const base = normalizePortraitManualTransform(state.manualTransform);
    const width = state?.startRect?.width || 1;
    const finalX = (Number(base.x) || 0) + (Number(dx) || 0);
    const autoTilt = getPortraitAutoTiltForX(finalX, width);
    state.dragTiltOffset = clampPortraitTilt(finalTilt) - autoTilt;
  }

  function userOwnsPortraitActor(actor, user) {
    if (!actor || !user) return false;
    if (user.id === game.user?.id) return !!actor.isOwner;

    try {
      if (typeof actor.testUserPermission === "function") {
        if (actor.testUserPermission(user, "OWNER")) return true;
        const ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER;
        if (ownerLevel != null && actor.testUserPermission(user, ownerLevel)) return true;
      }
    } catch (e) {}

    const ownership = actor.ownership?.[user.id] ?? actor.data?.permission?.[user.id] ?? actor.permission?.[user.id];
    return Number(ownership) >= 3;
  }

  function canUserReorderPortrait(actorId, userOrId = game.user) {
    const actor = getPortraitDragActor(actorId);
    const user = getUserById(userOrId);
    const mode = getPortraitDragAccessMode();
    if (!actor || !user || mode === "none") return false;
    if (user.isGM) return mode === "all" || mode === "gm";
    if (mode !== "all" && mode !== "players") return false;

    return userOwnsPortraitActor(actor, user);
  }

  function collectPortraitDragSlots(rail, draggedWrapper) {
    if (!rail) return [];

    return Array.from(rail.querySelectorAll(".ginzzzu-portrait-wrapper"))
      .map((wrapper, index) => {
        const rect = wrapper.getBoundingClientRect();
        return {
          wrapper,
          index,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          centerX: rect.left + (rect.width / 2),
          isDragged: wrapper === draggedWrapper
        };
      });
  }

  function setPortraitDragTarget(state, targetWrapper) {
    if (!state) return;
    if (state.targetWrapper === targetWrapper) return;
    state.targetWrapper?.classList?.remove("ginzzzu-portrait-drag-target");
    state.targetWrapper = targetWrapper || null;
    state.targetWrapper?.classList?.add("ginzzzu-portrait-drag-target");
  }

  function setPortraitNameDragVisual(state, dx, dy, lift) {
    const badge = state?.nameBadge || getPortraitNameBadge(state?.actorId, state?.root);
    if (!badge) return;

    state.nameBadge = badge;
    badge.classList.add("ginzzzu-portrait-name-dragging");
    badge.classList.remove("ginzzzu-portrait-name-returning");
    badge.classList.toggle("ginzzzu-portrait-name-remote-dragging", !!state.remote);
    scheduleNamePositionsUpdate();
  }

  function clearPortraitNameDragVisual(state, { animateBack = false } = {}) {
    const badge = state?.nameBadge || getPortraitNameBadge(state?.actorId, state?.root);
    if (!badge) return;

    if (animateBack) {
      badge.classList.remove("ginzzzu-portrait-name-dragging");
      badge.classList.remove("ginzzzu-portrait-name-remote-dragging");
      badge.classList.add("ginzzzu-portrait-name-returning");
      followNamePositionsFor(Math.max(0, Number(_ANIM.moveMs) || 0) + 80);
    } else {
      badge.classList.add("ginzzzu-portrait-name-dragging");
    }

    if (!animateBack) {
      requestAnimationFrame(() => {
        if (badge.isConnected) {
          badge.classList.remove("ginzzzu-portrait-name-dragging");
          badge.classList.remove("ginzzzu-portrait-name-remote-dragging");
        }
      });
    } else {
      const delay = Math.max(0, Number(_ANIM.moveMs) || 0) + 80;
      setTimeout(() => {
        if (badge.isConnected) {
          badge.classList.remove("ginzzzu-portrait-name-returning");
        }
      }, delay);
    }
  }

  function applyPortraitDragVisual(state, dx, dy, { targetWrapper = null, detached = false, detachThreshold = null } = {}) {
    if (!state?.wrapper) return;

    const threshold = Math.max(1, detachThreshold ?? state.detachThreshold ?? PORTRAIT_DRAG.minDetachPx);
    const lift = -Math.min(12, 12 * (Math.abs(dx) / threshold));
    const baseTransform = normalizePortraitManualTransform(state.manualTransform);
    const finalX = (Number(baseTransform.x) || 0) + (Number(dx) || 0);
    const targetTilt = clampPortraitTilt(
      getPortraitAutoTiltForX(finalX, state.startRect.width) + getPortraitDragTiltOffset(state)
    );
    const tilt = targetTilt - (Number(baseTransform.tilt) || 0);

    state.lastDx = dx;
    state.lastDy = dy;
    state.lastLift = lift;
    state.lastTilt = tilt;
    state.detached = !!detached;
    state.dragScale = Number.isFinite(Number(state.dragScale)) ? Number(state.dragScale) : 1;

    state.wrapper.classList.toggle("ginzzzu-portrait-detached", !!detached);
    setPortraitDragTarget(state, targetWrapper);

    state.wrapper.style.setProperty("--ginzzzu-drag-x", `${Math.round(dx)}px`);
    state.wrapper.style.setProperty("--ginzzzu-drag-y", `${Math.round(dy)}px`);
    state.wrapper.style.setProperty("--ginzzzu-drag-lift", `${lift.toFixed(2)}px`);
    state.wrapper.style.setProperty("--ginzzzu-drag-tilt", `${tilt.toFixed(2)}deg`);
    state.wrapper.style.setProperty("--ginzzzu-drag-scale", String(state.dragScale));

    setPortraitNameDragVisual(state, dx, dy, lift);
  }

  function getPortraitDragPayload(state, phase, extra = {}) {
    const width = Math.max(1, state?.startRect?.width || 1);
    const height = Math.max(1, state?.startRect?.height || 1);

    return {
      type: "portraitDragPreview",
      phase,
      actorId: state.actorId,
      userId: game.user?.id,
      sceneId: canvas?.scene?.id,
      dxRatio: (state.lastDx || 0) / width,
      dyRatio: (state.lastDy || 0) / height,
      dragScale: Number(state.dragScale) || 1,
      dragTiltOffset: getPortraitDragTiltOffset(state),
      detached: !!state.detached,
      targetActorId: state.targetWrapper?.dataset?.actorId || null,
      ...extra
    };
  }

  function emitPortraitDragPreview(state, phase, { force = false, ...extra } = {}) {
    if (!state || !game.socket) return;
    if (!isPortraitDragSyncEnabled()) return;

    const now = performance?.now?.() ?? Date.now();
    if (!force && phase === "move" && now - lastPortraitDragSocketAt < 33) return;

    lastPortraitDragSocketAt = now;
    try {
      game.socket.emit(`module.${MODULE_ID}`, getPortraitDragPayload(state, phase, extra));
    } catch (e) {
      console.error("[threeO-portraits] portrait drag preview emit failed:", e);
    }
  }

  function getRemotePortraitDragKey(data) {
    return `${data.sceneId || ""}:${data.userId || ""}:${data.actorId || ""}`;
  }

  function getWrapperByActorId(actorId, root = getDomHud()) {
    if (!actorId || !root) return null;
    try {
      return root.querySelector(`.ginzzzu-portrait-wrapper[data-actor-id="${actorId}"]`);
    } catch (e) {
      return null;
    }
  }

  function beginRemotePortraitDrag(data) {
    const root = getDomHud();
    const rail = getPortraitRail(root);
    const wrapper = getWrapperByActorId(data.actorId, root);
    if (!root || !rail || !wrapper) return null;

    const startRect = wrapper.getBoundingClientRect();
    const state = {
      actorId: data.actorId,
      userId: data.userId,
      root,
      rail,
      wrapper,
      pointerId: null,
      startX: 0,
      startY: 0,
      lastDx: 0,
      lastDy: 0,
      dragScale: 1,
      startRect,
      startCenterX: startRect.left + (startRect.width / 2),
      detachThreshold: Math.max(
        PORTRAIT_DRAG.minDetachPx,
        startRect.width * PORTRAIT_DRAG.detachRatio
      ),
      slots: collectPortraitDragSlots(rail, wrapper),
      originalTransition: wrapper.style.transition,
      manualTransform: getAppliedPortraitManualTransform(wrapper, data.actorId),
      dragging: true,
      detached: false,
      targetWrapper: null,
      remote: true
    };

    wrapper.classList.add("ginzzzu-portrait-dragging", "ginzzzu-portrait-remote-dragging");
    wrapper.style.setProperty("--ginzzzu-remote-drag-duration", "90ms");
    wrapper.style.transition = [
      "--ginzzzu-drag-x 90ms linear",
      "--ginzzzu-drag-y 90ms linear",
      "--ginzzzu-drag-lift 90ms linear",
      "--ginzzzu-drag-tilt 90ms linear",
      "--ginzzzu-drag-scale 90ms linear"
    ].join(", ");
    setPortraitNameDragVisual(state, 0, 0, 0);
    remotePortraitDrags.set(getRemotePortraitDragKey(data), state);
    return state;
  }

  function applyRemotePortraitDragPreview(data) {
    if (!data?.actorId || data.userId === game.user?.id) return;
    if (data.sceneId && data.sceneId !== canvas?.scene?.id) return;
    if (!getPortraitDragActor(data.actorId)) return;
    if (!canUserReorderPortrait(data.actorId, data.userId)) return;

    const key = getRemotePortraitDragKey(data);
    let state = remotePortraitDrags.get(key);
    if (!isPortraitDragSyncEnabled()) {
      if (state) {
        remotePortraitDrags.delete(key);
        clearPortraitDragVisual(state, { animateBack: false });
      }
      return;
    }

    if (data.phase === "start") {
      if (state) clearPortraitDragVisual(state, { animateBack: false });
      beginRemotePortraitDrag(data);
      return;
    }

    if (!state) state = beginRemotePortraitDrag(data);
    if (!state) return;

    if (data.phase === "end" || data.phase === "cancel") {
      remotePortraitDrags.delete(key);
      const keptPosition = data.phase === "end" && !!data.kept && data.manualTransform;
      const resetPosition = data.phase === "end" && !!data.reset && data.manualTransform;
      if (data.phase === "end") {
        const dx = Number(data.dxRatio || 0) * Math.max(1, state.startRect.width);
        const dy = Number(data.dyRatio || 0) * Math.max(1, state.startRect.height);
        state.dragScale = clampNumber(Number(data.dragScale) || 1, 0.1, 4);
        if (Number.isFinite(Number(data.dragTiltOffset))) {
          state.dragTiltOffset = Number(data.dragTiltOffset);
        }
        applyPortraitDragVisual(state, dx, dy, {
          targetWrapper: null,
          detached: !!data.detached,
          detachThreshold: state.detachThreshold
        });
      }
      if (keptPosition || resetPosition) {
        if (Number.isFinite(Number(data.zIndex))) {
          setPortraitManualZIndex(data.actorId, Number(data.zIndex), { root: state.root });
        }
        const stagedTransform = keptPosition
          ? data.manualTransform
          : getPortraitDragFinalManualTransform(state);
        applyPortraitManualTransform(data.actorId, stagedTransform, { root: state.root, scheduleNames: false });
      }
      clearPortraitDragVisual(state, {
        animateBack: data.phase === "cancel" || (!data.swapped && !keptPosition && !resetPosition)
      });
      if (resetPosition) {
        requestAnimationFrame(() => {
          applyPortraitManualTransform(data.actorId, data.manualTransform, {
            root: state.root,
            animate: true
          });
        });
      }
      return;
    }

    const dx = Number(data.dxRatio || 0) * Math.max(1, state.startRect.width);
    const dy = Number(data.dyRatio || 0) * Math.max(1, state.startRect.height);
    state.dragScale = clampNumber(Number(data.dragScale) || 1, 0.1, 4);
    if (Number.isFinite(Number(data.dragTiltOffset))) {
      state.dragTiltOffset = Number(data.dragTiltOffset);
    }
    applyPortraitDragVisual(state, dx, dy, {
      targetWrapper: null,
      detached: !!data.detached,
      detachThreshold: state.detachThreshold
    });
  }

  function findPortraitDragTarget(state) {
    if (!state?.slots?.length || !state.wrapper) return null;

    const direction = Math.sign(state.lastDx);
    if (!direction) return null;

    const dragCenterX = state.startCenterX + state.lastDx;

    let best = null;
    let bestDistance = Infinity;

    for (const slot of state.slots) {
      if (slot.isDragged) continue;

      const isOnDragSide = direction > 0
        ? slot.centerX > state.startCenterX
        : slot.centerX < state.startCenterX;
      if (!isOnDragSide) continue;

      const buffer = Math.min(slot.width * PORTRAIT_DRAG.targetBufferRatio, 24);
      const overlaps = dragCenterX >= slot.left && dragCenterX <= slot.right;
      const crossed = direction > 0
        ? dragCenterX >= slot.centerX - buffer
        : dragCenterX <= slot.centerX + buffer;
      if (!overlaps && !crossed) continue;

      const distance = Math.abs(dragCenterX - slot.centerX);
      if (distance < bestDistance) {
        best = slot.wrapper;
        bestDistance = distance;
      }
    }

    return best;
  }

  function swapPortraitWrappers(a, b) {
    if (!a || !b || a === b || a.parentNode !== b.parentNode) return false;

    const parent = a.parentNode;
    const aNext = a.nextSibling;
    const bNext = b.nextSibling;

    if (aNext === b) {
      parent.insertBefore(b, a);
    } else if (bNext === a) {
      parent.insertBefore(a, b);
    } else {
      parent.insertBefore(a, bNext);
      parent.insertBefore(b, aNext);
    }

    return true;
  }

  function clearPortraitDragVisual(state, { animateBack = false } = {}) {
    if (!state?.wrapper) return;

    const wrapper = state.wrapper;
    const shouldAnimateBack = animateBack;
    setPortraitDragTarget(state, null);
    if (!state.remote) state.root?.classList?.remove("ginzzzu-portrait-drag-active");
    wrapper.classList.remove(
      "ginzzzu-portrait-drag-pending",
      "ginzzzu-portrait-dragging",
      "ginzzzu-portrait-remote-dragging",
      "ginzzzu-portrait-detached"
    );

    if (shouldAnimateBack) {
      wrapper.style.transition = state.originalTransition || `transform ${_ANIM.moveMs}ms ${_ANIM.easing}`;
      void wrapper.offsetWidth;
    } else {
      wrapper.style.transition = "none";
    }

    wrapper.style.removeProperty("--ginzzzu-remote-drag-duration");
    wrapper.style.removeProperty("--ginzzzu-drag-x");
    wrapper.style.removeProperty("--ginzzzu-drag-y");
    wrapper.style.removeProperty("--ginzzzu-drag-lift");
    wrapper.style.removeProperty("--ginzzzu-drag-tilt");
    wrapper.style.removeProperty("--ginzzzu-drag-scale");
    clearPortraitNameDragVisual(state, { animateBack: shouldAnimateBack });

    if (!shouldAnimateBack) {
      requestAnimationFrame(() => {
        if (wrapper.isConnected) {
          wrapper.style.transition = state.originalTransition || `transform ${_ANIM.moveMs}ms ${_ANIM.easing}`;
        }
      });
    }

    if (shouldAnimateBack) {
      const delay = Math.max(0, Number(_ANIM.moveMs) || 0) + 80;
      followNamePositionsFor(delay);
      setTimeout(() => scheduleNamePositionsUpdate(), delay);
    } else {
      scheduleNamePositionsUpdate();
    }
  }

  function finishPortraitDrag(ev, { cancelled = false } = {}) {
    const state = activePortraitDrag;
    if (!state) return;
    if (ev && ev.pointerId != null && ev.pointerId !== state.pointerId) return;

    activePortraitDrag = null;

    window.removeEventListener("pointermove", _onPortraitPointerMove);
    window.removeEventListener("pointerup", _onPortraitPointerUp);
    window.removeEventListener("pointercancel", _onPortraitPointerCancel);
    window.removeEventListener("wheel", _onPortraitWheel);

    try { state.wrapper.releasePointerCapture?.(state.pointerId); } catch (e) {}

    const shiftRelease = !!ev?.shiftKey;
    const canSwap = !cancelled && state.dragging && state.detached && state.targetWrapper?.isConnected;
    const shouldSwap = canSwap && !shiftRelease;
    const resetOnRelease = shouldResetPortraitDragPositionOnRelease();
    const shouldKeepPosition = !cancelled && state.dragging && !shouldSwap && (
      resetOnRelease ? shiftRelease : !shiftRelease
    );
    const shouldResetPosition = !cancelled && state.dragging && !shouldSwap && !shouldKeepPosition;
    const finalManualTransform = shouldKeepPosition
      ? getPortraitDragFinalManualTransform(state)
      : (shouldResetPosition ? normalizePortraitManualTransform(null) : null);
    const manualZIndex = (shouldKeepPosition || shouldResetPosition)
      ? setPortraitManualZIndex(state.actorId, null, { root: state.root })
      : null;
    const firstRects = shouldSwap ? collectFirstRects() : null;
    const targetWrapper = state.targetWrapper;

    if (ev && state.dragging) {
      ev.preventDefault?.();
      ev.stopPropagation?.();
    }

    if (state.dragging) {
      emitPortraitDragPreview(state, cancelled ? "cancel" : "end", {
        force: true,
        swapped: shouldSwap,
        kept: shouldKeepPosition,
        reset: shouldResetPosition,
        manualTransform: finalManualTransform,
        zIndex: manualZIndex
      });
    }

    if (shouldKeepPosition) {
      applyPortraitManualTransform(state.actorId, finalManualTransform, {
        root: state.root,
        scheduleNames: false
      });
      clearPortraitDragVisual(state, { animateBack: false });
      setSyncedPortraitManualTransform(state.actorId, finalManualTransform, {
        applyLocal: false,
        zIndex: manualZIndex
      });
    } else if (shouldResetPosition) {
      applyPortraitManualTransform(state.actorId, getPortraitDragFinalManualTransform(state), {
        root: state.root,
        scheduleNames: false
      });
      clearPortraitDragVisual(state, { animateBack: false });
      requestAnimationFrame(() => {
        setSyncedPortraitManualTransform(state.actorId, finalManualTransform, {
          applyLocal: true,
          animate: true,
          zIndex: manualZIndex
        });
      });
    } else {
      clearPortraitDragVisual(state, { animateBack: state.dragging && !shouldSwap });
    }

    if (shouldSwap && swapPortraitWrappers(state.wrapper, targetWrapper)) {
      relayoutDomHud(firstRects);
      setSharedPortraitSequence(getCurrentPortraitSequence(), { movedActorId: state.actorId });
    } else if (pendingSharedPortraitSequence) {
      const sequence = pendingSharedPortraitSequence;
      pendingSharedPortraitSequence = null;
      applySharedPortraitSequence(sequence, { animate: true });
    }
  }

  function beginPortraitDrag(state) {
    if (!state || state.dragging) return;
    state.dragging = true;
    state.wrapper.classList.remove("ginzzzu-portrait-drag-pending");
    state.wrapper.classList.add("ginzzzu-portrait-dragging");
    state.wrapper.style.transition = "none";
    setPortraitNameDragVisual(state, 0, 0, 0);
    emitPortraitDragPreview(state, "start", { force: true });
  }

  function updatePortraitDrag(ev) {
    const state = activePortraitDrag;
    if (!state || ev.pointerId !== state.pointerId) return;

    if (state.altTransformDragActive && !ev.altKey) {
      state.startX = ev.clientX - (Number(state.lastDx) || 0);
      state.startY = ev.clientY - (Number(state.lastDy) || 0);
      state.altTransformDragActive = false;
    }

    let dx = ev.clientX - state.startX;
    let dy = ev.clientY - state.startY;
    const distance = Math.hypot(dx, dy);

    if (!state.dragging && distance < PORTRAIT_DRAG.startThresholdPx) return;
    beginPortraitDrag(state);

    ev.preventDefault();
    ev.stopPropagation();

    const detachThreshold = Math.max(
      PORTRAIT_DRAG.minDetachPx,
      state.startRect.width * PORTRAIT_DRAG.detachRatio
    );
    state.detachThreshold = detachThreshold;

    if (ev.altKey) {
      if (!state.altTransformDragActive) {
        const currentDx = Number(state.lastDx);
        const currentDy = Number(state.lastDy);
        state.altTransformDragActive = true;
        state.altStartX = ev.clientX;
        state.altStartY = ev.clientY;
        state.altStartFinalScale = getPortraitDragFinalScale(state);
        state.altStartTiltOffset = getPortraitDragTiltOffset(state);
        state.altBaseDx = Number.isFinite(currentDx) ? currentDx : dx;
        state.altBaseDy = Number.isFinite(currentDy) ? currentDy : dy;
      }

      dx = Number(state.altBaseDx) || 0;
      dy = Number(state.altBaseDy) || 0;

      const scaleFactor = Math.exp((state.altStartY - ev.clientY) * PORTRAIT_DRAG.pointerScaleSpeed);
      setPortraitDragFinalScale(state, state.altStartFinalScale * scaleFactor);

      const baseTransform = normalizePortraitManualTransform(state.manualTransform);
      const finalX = (Number(baseTransform.x) || 0) + dx;
      const autoTilt = getPortraitAutoTiltForX(finalX, state.startRect.width);
      const nextTilt = clampPortraitTilt(
        autoTilt +
        (Number(state.altStartTiltOffset) || 0) +
        ((ev.clientX - state.altStartX) * PORTRAIT_DRAG.pointerRotateSpeedDeg)
      );
      setPortraitDragFinalTilt(state, nextTilt, dx);
    }

    state.lastDx = dx;
    state.lastDy = dy;
    const targetWrapper = !ev.altKey && Math.abs(dx) >= detachThreshold ? findPortraitDragTarget(state) : null;
    const detached = !ev.altKey && (Math.abs(dx) >= detachThreshold || !!targetWrapper);

    applyPortraitDragVisual(state, dx, dy, { targetWrapper, detached, detachThreshold });
    emitPortraitDragPreview(state, "move");
  }

  function _onPortraitPointerMove(ev) {
    updatePortraitDrag(ev);
  }

  function _onPortraitPointerUp(ev) {
    finishPortraitDrag(ev);
  }

  function _onPortraitPointerCancel(ev) {
    finishPortraitDrag(ev, { cancelled: true });
  }

  function updatePortraitDragScale(ev) {
    const state = activePortraitDrag;
    if (!state) return;

    beginPortraitDrag(state);
    ev.preventDefault?.();
    ev.stopPropagation?.();

    const currentFinalScale = getPortraitDragFinalScale(state);
    const factor = Math.exp(-(Number(ev.deltaY) || 0) * PORTRAIT_DRAG.wheelScaleSpeed);

    setPortraitDragFinalScale(state, currentFinalScale * factor);
    applyPortraitDragVisual(state, state.lastDx || 0, state.lastDy || 0, {
      targetWrapper: state.targetWrapper,
      detached: !!state.detached,
      detachThreshold: state.detachThreshold
    });
    emitPortraitDragPreview(state, "move", { force: true });
  }

  function _onPortraitWheel(ev) {
    updatePortraitDragScale(ev);
  }

  function _onPortraitPointerDown(ev) {
    if (ev.button !== 0 || ev.ctrlKey || ev.metaKey) return;
    if (shouldIgnorePortraitDragTarget(ev.target)) return;

    const wrapper = ev.currentTarget?.closest?.(".ginzzzu-portrait-wrapper");
    if (!wrapper) return;
    const img = wrapper.querySelector("img.ginzzzu-portrait");
    if (!img?.dataset?.actorId) return;
    const actorId = img.dataset.actorId;

    if (!canUserReorderPortrait(actorId, game.user)) return;

    if (activePortraitDrag) {
      finishPortraitDrag(null, { cancelled: true });
    }

    const root = getDomHud();
    const rail = getPortraitRail(root);
    if (!root || !rail) return;

    const startRect = wrapper.getBoundingClientRect();

    activePortraitDrag = {
      actorId,
      root,
      rail,
      wrapper,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      lastDx: 0,
      lastDy: 0,
      dragScale: 1,
      startRect,
      startCenterX: startRect.left + (startRect.width / 2),
      detachThreshold: Math.max(
        PORTRAIT_DRAG.minDetachPx,
        startRect.width * PORTRAIT_DRAG.detachRatio
      ),
      slots: collectPortraitDragSlots(rail, wrapper),
      originalTransition: wrapper.style.transition,
      manualTransform: getAppliedPortraitManualTransform(wrapper, actorId),
      dragging: false,
      detached: false,
      targetWrapper: null
    };

    root.classList.add("ginzzzu-portrait-drag-active");
    wrapper.classList.add("ginzzzu-portrait-drag-pending");

    try { wrapper.setPointerCapture?.(ev.pointerId); } catch (e) {}

    window.addEventListener("pointermove", _onPortraitPointerMove, { passive: false });
    window.addEventListener("pointerup", _onPortraitPointerUp, { passive: false });
    window.addEventListener("pointercancel", _onPortraitPointerCancel, { passive: false });
    window.addEventListener("wheel", _onPortraitWheel, { passive: false });
  }

  function insertPortraitWrapperBySharedOrder(rail, wrapper) {
    const actorId = wrapper?.dataset?.actorId;
    const sequence = getSharedPortraitSequence();

    if (!rail || !actorId || !sequence.length || !sequence.includes(actorId)) {
      rail?.appendChild(wrapper);
      return;
    }

    const ownIndex = sequence.indexOf(actorId);
    const existingWrappers = Array.from(rail.querySelectorAll(".ginzzzu-portrait-wrapper"));
    const before = existingWrappers.find(existing => {
      const otherId = existing.dataset.actorId;
      const otherIndex = sequence.indexOf(otherId);
      return otherIndex !== -1 && otherIndex > ownIndex;
    });

    if (before) rail.insertBefore(wrapper, before);
    else rail.appendChild(wrapper);
  }

    // --- Фокус портрета (middle-click) ---

  // actorId того, кто сейчас "в фокусе" (или null, если никого)
  let _focusedActorId = null;

  function _getAllWrappers() {
    const root = getDomHud();
    if (!root) return [];
    return Array.from(root.querySelectorAll(".ginzzzu-portrait-wrapper"));
  }

  function _getDisplayName(actorId) {
    return globalThis.GinzzzuPortraits.getActorDisplayName(actorId);
  }

  function refreshPortraitDisplayNames() {
  const nameMode = game.settings.get(MODULE_ID, "portraitNamesAlwaysVisible") || "hover";
  const showNames = nameMode !== "none";

  const root = getDomHud();
  const wrappers = root ? Array.from(root.querySelectorAll(".ginzzzu-portrait-wrapper")) : [];
  const namesContainer = root ? root.querySelector('#ginzzzu-portrait-names') : null;
  const badgesByActorId = new Map(
    namesContainer
      ? Array.from(namesContainer.querySelectorAll('.ginzzzu-portrait-name[data-actor-id]')).map(badge => [badge.dataset.actorId, badge])
      : []
  );
  const alwaysShowNames = !!root?.classList?.contains('ginzzzu-show-names-always');
  for (const wrapper of wrappers) {
    const actorId = wrapper.dataset.actorId || "";
    const displayName = _getDisplayName(actorId);
    const rawName = wrapper.dataset.rawName ?? "";
    const safeName = String(displayName || rawName);

    updatePortraitReorderCursor(wrapper, actorId);
    wrapper.dataset.displayName = safeName;
    let badge = badgesByActorId.get(actorId) || null;

    if (!safeName || !showNames) {
      // Имя пустое или режим "не показывать" — удаляем плашку
      if (badge) {
        badge.remove();
        badge = null;
        badgesByActorId.delete(actorId);
      }
    } else if (safeName && !badge && namesContainer) {
      // Имя появилось и показ разрешён — создаём плашку in names container
      badge = document.createElement("div");
      badge.className = "ginzzzu-portrait-name";
      badge.dataset.actorId = actorId;
      const inner = document.createElement('span');
      inner.className = 'ginzzzu-portrait-name-inner';
      inner.textContent = safeName;
      badge.appendChild(inner);
      namesContainer.appendChild(badge);
      badgesByActorId.set(actorId, badge);

      // attach hover handlers from the wrapper if present
      try {
        const wrapperEl = root.querySelector(`.ginzzzu-portrait-wrapper[data-actor-id="${actorId}"]`);
        if (wrapperEl) {
          wrapperEl.addEventListener('mouseenter', () => badge.classList.add('visible'), { passive: true });
          wrapperEl.addEventListener('mouseleave', () => {
            if (getDomHud()?.classList?.contains('ginzzzu-show-names-always')) return;
            badge.classList.remove('visible');
          }, { passive: true });
        }
      } catch (e) {}
    }

    if (badge) {
      // Update inner text element, create if missing
      let innerEl = badge.querySelector('.ginzzzu-portrait-name-inner');
      if (!innerEl) {
        innerEl = document.createElement('span');
        innerEl.className = 'ginzzzu-portrait-name-inner';
        // clear stray text nodes
        badge.textContent = '';
        badge.appendChild(innerEl);
      }
      innerEl.textContent = safeName;
      badge.classList.toggle('flipped', wrapper.classList.contains("ginzzzu-portrait-flipped"));
      // Ensure visible state for always-show mode
      if (alwaysShowNames) {
        badge.classList.add('visible');
      } else {
        badge.classList.remove('visible');
      }
    }

    // alt тоже освежим
    const img = wrapper.querySelector("img.ginzzzu-portrait");
    if (img) {
      img.dataset.rawName = rawName;
      img.alt = safeName || "Portrait";
    }
  }
}


  function _getFocusShadowParams() {
    // 0..1 – сила подсветки
    let focusS = Number(game.settings.get(MODULE_ID, "portraitFocusHighlightStrength") ?? 0.5);
    let shadowS = Number(game.settings.get(MODULE_ID, "portraitShadowDimStrength") ?? 0.5);
    focusS  = Math.max(0, Math.min(1, focusS));
    shadowS = Math.max(0, Math.min(1, shadowS));

    // Подбираем коэффициенты так, чтобы при s=0.5 примерно попасть
    // в старые значения (brightness 1.12 / 0.7, saturate 1.05 / 0.8)
    const focusBrightness = 1 + 0.24 * focusS;  // 0..+0.24
    const focusSaturate   = 1 + 0.10 * focusS;  // 0..+0.10

    const dimBrightness   = 1 - 0.60 * shadowS; // 1..0.4
    const dimSaturate     = 1 - 0.40 * shadowS; // 1..0.6

    return { focusBrightness, focusSaturate, dimBrightness, dimSaturate };
  }


  function _applyPortraitFocus() {
    const wrappers = _getAllWrappers();
    if (!wrappers.length) return;

    // Берём значения из настроек (0..1)
    const {
      focusBrightness,
      focusSaturate,
      dimBrightness,
      dimSaturate
    } = _getFocusShadowParams();

    const focusPortraitBlurEnabled = game.settings.get(MODULE_ID, "portraitFocusPortraitBlurEnabled");
    const portraitBlurStrength = focusPortraitBlurEnabled 
      ? Math.max(1, Math.min(30, Number(game.settings.get(MODULE_ID, "portraitFocusPortraitBlurStrength")) || 8))
      : 0;

    for (const wrapper of wrappers) {
      const img = wrapper.querySelector("img.ginzzzu-portrait");
      if (!img) continue;

      const actorId = img.dataset.actorId;

      // Сохраняем базовый filter и zIndex (чтобы можно было откатить)
      if (!img.dataset.baseFilter) {
        img.dataset.baseFilter = img.style.filter || "";
      }
      if (!wrapper.dataset.baseZ) {
        wrapper.dataset.baseZ = wrapper.style.zIndex || "";
      }

      if (_focusedActorId && actorId === _focusedActorId) {
        // Активный портрет: выше по z-index и чуть ярче/насыщеннее
        wrapper.classList.add("ginzzzu-portrait-focused");
        wrapper.classList.remove("ginzzzu-portrait-dimmed");
        wrapper.style.zIndex = "9999";

        img.style.filter = `${img.dataset.baseFilter} brightness(${focusBrightness}) saturate(${focusSaturate})`;

      } else if (_focusedActorId) {
        // Остальные — в "тень", но без изменения размера
        wrapper.classList.remove("ginzzzu-portrait-focused");
        wrapper.classList.add("ginzzzu-portrait-dimmed");
        wrapper.style.zIndex = getPortraitLayerZIndex(actorId, wrapper.dataset.baseZ || wrapper.style.zIndex);

        // Build filter string with blur if enabled
        let filterStr = `${img.dataset.baseFilter} brightness(${dimBrightness}) saturate(${dimSaturate})`;
        if (focusPortraitBlurEnabled && portraitBlurStrength > 0) {
          filterStr += ` blur(${portraitBlurStrength}px)`;
        }
        img.style.filter = filterStr;

      } else {
        // Фокуса нет — вернуть всё как было
        wrapper.classList.remove("ginzzzu-portrait-focused", "ginzzzu-portrait-dimmed");

        if (wrapper.dataset.baseZ) {
          wrapper.style.zIndex = getPortraitLayerZIndex(actorId, wrapper.dataset.baseZ);
        }
        if (img.dataset.baseFilter) {
          img.style.filter = img.dataset.baseFilter;
        }
      }
    }

    // === Apply focus blur effect to background ===
    const root = getDomHud();
    if (!root) return;
    if (isPortraitUiHidden(root)) {
      clearPortraitBlur(root);
      return;
    }

    const focusBlurEnabled = game.settings.get(MODULE_ID, "portraitFocusBlurEnabled");
    const blurEnabled = game.settings.get(MODULE_ID, "portraitBlurEnabled");
    
    if (_focusedActorId && focusBlurEnabled) {
      // When focus is active and focus blur is enabled, apply focus blur effect
      const focusBlurStrength = Math.max(1, Math.min(30, Number(game.settings.get(MODULE_ID, "portraitFocusBlurStrength")) || 16));
      
      // Check if base blur is also enabled, if so add both strengths
      if (blurEnabled) {
        const baseBlurStrength = Math.max(1, Math.min(30, Number(game.settings.get(MODULE_ID, "portraitBlurStrength")) || 8));
        const totalBlurStrength = baseBlurStrength + focusBlurStrength;
        root.style.setProperty("--ginzzzu-blur-strength-value", `${totalBlurStrength}px`);
      } else {
        // Base blur disabled, use only focus blur strength
        root.style.setProperty("--ginzzzu-blur-strength-value", `${focusBlurStrength}px`);
      }
      
      root.classList.add("ginzzzu-portrait-blur-active");
      root.classList.add("ginzzzu-portrait-focus-blur-active");
    } else if (!_focusedActorId && blurEnabled) {
      // When focus is removed and base blur is enabled, restore base blur strength
      const baseBlurStrength = Math.max(1, Math.min(30, Number(game.settings.get(MODULE_ID, "portraitBlurStrength")) || 8));
      root.style.setProperty("--ginzzzu-blur-strength-value", `${baseBlurStrength}px`);
      root.classList.add("ginzzzu-portrait-blur-active");
      root.classList.remove("ginzzzu-portrait-focus-blur-active");
    } else {
      // All blur effects disabled or conditions not met
      root.classList.remove("ginzzzu-portrait-blur-active");
      root.classList.remove("ginzzzu-portrait-focus-blur-active");
      root.style.removeProperty("--ginzzzu-blur-strength-value");
      root.style.removeProperty("--ginzzzu-blur-speed-value");
    }
  }

  // --- Флип портрета (горизонтальное отражение) ---

  // Обновляем визуальный флип через класс на wrapper
  function _updateImgTransformForFlip(img) {
    if (!img) return;
    const wrapper = img.closest(".ginzzzu-portrait-wrapper");
    if (!wrapper) return;

    const isFlipped = img.dataset.flipped === "1";

    // Mirror badge text back so it's readable (badges live in names container)
    let badge = null;
    try {
      const root = getDomHud();
      const namesContainer = root ? root.querySelector('#ginzzzu-portrait-names') : null;
      badge = namesContainer ? namesContainer.querySelector(`.ginzzzu-portrait-name[data-actor-id="${img.dataset.actorId}"]`) : null;
    } catch (e) {}

    const wrapperAlreadyFlipped = wrapper.classList.contains("ginzzzu-portrait-flipped") === isFlipped;
    const badgeAlreadyFlipped = !badge || badge.classList.contains("flipped") === isFlipped;
    if (wrapperAlreadyFlipped && badgeAlreadyFlipped) return;

    // навешиваем/снимаем класс, сам transform перенесём в CSS
    if (!wrapperAlreadyFlipped) wrapper.classList.toggle("ginzzzu-portrait-flipped", isFlipped);
    if (badge && !badgeAlreadyFlipped) badge.classList.toggle('flipped', isFlipped);
  }


  // локальное применение флипа по actorId (без записи в сцену)
  function _setLocalFlipByActorId(actorId, isFlipped) {
    if (!actorId) return;
    const map = domStore();
    const img = map.get(actorId);
    if (!img) return;

    const nextValue = isFlipped ? "1" : "0";
    if (img.dataset.flipped !== nextValue) img.dataset.flipped = nextValue;
    _updateImgTransformForFlip(img);
  }

  // общий флип с синхронизацией через флаг сцены
  function setSharedPortraitFlip(actorId, isFlipped) {
    // мгновенный отклик локально
    _setLocalFlipByActorId(actorId, isFlipped);

    const scene = canvas?.scene;
    if (!scene || !game.user?.isGM) return;

    try {
      const flagPath = `flags.${MODULE_ID}.flipped.${actorId}`;
      scene.update({ [flagPath]: !!isFlipped });
    } catch (e) {
      console.error("[threeO-portraits] setSharedPortraitFlip error:", e);
    }
  }

function _onPortraitClick(ev) {
  // Реагируем только на ПКМ
  if (ev.type !== "contextmenu") return;
  if (ev.button !== 2) return;

  ev.preventDefault();
  ev.stopPropagation();

  const wrapper = ev.currentTarget.closest(".ginzzzu-portrait-wrapper");
  if (!wrapper) return;
  const img = wrapper.querySelector("img.ginzzzu-portrait");
  if (!img) return;

  const actorId = img.dataset.actorId;
  if (!actorId) return;

  const actor = game.actors?.get(actorId);
  if (!actor) return;

  // Ctrl+RMB — открыть лист актёра
  if (ev.ctrlKey || ev.metaKey) {
    try {
      actor.sheet?.render(true);
    } catch (e) {
      console.error("[ginzzzu-portraits] Failed to open actor sheet:", e);
    }
    return;
  }

  const isGMUser = !!game.user?.isGM;
  const isOwner  = !!actor.isOwner;

  // Режим доступа к флипу: "gm" или "owners"
  let flipMode = "gm";
  try {
    flipMode = game.settings.get(MODULE_ID, "portraitFlipAccess") || "gm";
  } catch (e) {
    flipMode = "gm";
  }

  // Проверяем право флипа:
  // - ГМ всегда может
  // - владельцы могут, только если включён режим "owners"
  if (!isGMUser) {
    if (flipMode !== "owners" || !isOwner) {
      return;
    }
  }

  const current = img.dataset.flipped === "1";
  const next = !current;

  // Мгновенный локальный отклик HUD
  _setLocalFlipByActorId(actorId, next);

  // Сохраняем в флаги актёра → обновится у всех
  actor.update({
    flags: {
      [MODULE_ID]: {
        portraitFlipX: next
      }
    }
  }).catch(e => {
    console.error("[ginzzzu-portraits] portrait flip actor.update failed:", e);
  });
}


  function setPortraitFocusByActorId(actorIdOrNull) {
    _focusedActorId = actorIdOrNull || null;
    _applyPortraitFocus();
  }

  function setSharedPortraitFocus(actorIdOrNull) {
    const scene = canvas?.scene;
    const value = actorIdOrNull || null;

    // мгновенный локальный отклик (чтоб ГМ не ждал round-trip)
    setPortraitFocusByActorId(value);

    // Только ГМ обновляет сцену, остальным достаточно локального обновления
    if (!scene || !game.user?.isGM) return;

    try {
      scene.update({ [`flags.${MODULE_ID}.focusedActorId`]: value });
    } catch (e) {
      console.error("[threeO-portraits] setSharedPortraitFocus error:", e);
    }
  }

  function _onPortraitAuxClick(ev) {
    if (!game.user?.isGM) return; 
    // реагируем только на отпускание средней кнопки (auxclick)
    if (ev.type !== "auxclick") return;

    const button = ev.button;
    if (button !== 1) return;

    ev.preventDefault();
    ev.stopPropagation();

    const wrapper = ev.currentTarget.closest(".ginzzzu-portrait-wrapper");
    if (!wrapper) return;
    const img = wrapper.querySelector("img.ginzzzu-portrait");
    if (!img) return;

    const actorId = img.dataset.actorId;
    if (!actorId) return;

    if (_focusedActorId === actorId) {
      // повторный клик по тому же — снять подсветку
      setSharedPortraitFocus(null);      // см. ниже
    } else {
      setSharedPortraitFocus(actorId);   // см. ниже
    }
  }

  function _onPortraitCtrlClick(ev) {
    // React only to left-click with Ctrl (or Meta for mac users)
    if (ev.type !== "click") return;
    if (ev.button !== 0) return;
    if (!(ev.ctrlKey || ev.metaKey)) return;

    ev.preventDefault();
    ev.stopPropagation();

    const wrapper = ev.currentTarget && ev.currentTarget.closest
      ? ev.currentTarget.closest(".ginzzzu-portrait-wrapper")
      : null;
    if (!wrapper) return;
    const img = wrapper.querySelector("img.ginzzzu-portrait");
    if (!img) return;

    const actorId = img.dataset.actorId;
    if (!actorId) return;

    const actor = game.actors?.get(actorId);
    if (!actor) return;

    // Allow hiding if user is GM or owner of the actor
    const canHide = !!game.user?.isGM || !!actor.isOwner;
    if (!canHide) return;

    try {
      actor.update({ [FLAG_PORTRAIT_SHOWN]: false });
    } catch (e) {
      console.error("[ginzzzu-portraits] ctrl-click hide portrait failed:", e);
    }
  }



  // FIRST: текущие позиции всех портретов (для FLIP)
  function collectFirstRects() {
    const root = getDomHud();
    if (!root) return new Map();
    const rail = root.querySelector("#ginzzzu-portrait-rail") || root;
    const imgs = Array.from(rail.querySelectorAll("img.ginzzzu-portrait"));
    const m = new Map();
    imgs.forEach(el => m.set(el, el.getBoundingClientRect()));
    return m;
  }

  // Применить «жёсткую» геометрию рамки и общий зазор
  function applyGeometry(imgs, vw) {
    // вычисляем базовую ширину рамки из процента и ограничений
    const wantWpx = Math.min(FRAME.maxWidthPx, Math.max(FRAME.minWidthPx, Math.floor((FRAME.widthVw / 100) * vw)));
    // учёт левого и правого паддинга (правый включает текущую ширину #sidebar)
    const sidebarW = getSidebarWidth();
    const leftPad = FRAME.sidePadPx;
    const rightPad = FRAME.sidePadPx + sidebarW;
    const bandW = Math.floor(vw * FRAME.targetBand) - leftPad - rightPad;

    const n = imgs.length || 0;
    let widthPx = wantWpx;
    let gapPx = FRAME.gapBase;

    if (n <= 1) {
      gapPx = 0;
    } else {
      // если разрешено менять width, заранее ограничим его, чтобы не было слишком явного переползания
      if (game.settings.get(MODULE_ID, "visualNovelMode") === false && game.settings.get(MODULE_ID, "resizeToFit")) {
        const possibleAtMinGap = Math.floor((bandW - (n - 1) * FRAME.gapMin) / n);
        widthPx = Math.max(FRAME.minWidthPx, Math.min(wantWpx, possibleAtMinGap));
      }

      // Попытка вместить ряд, регулируя gap. idealGap может быть отрицательным (перекрытие).
      const idealGap = Math.floor((bandW - n * widthPx) / (n - 1));
      // Максимальное допустимое перекрытие (процент ширины)
      const maxOverlap = Math.max(0, Math.floor(widthPx)); // до 100% ширины
      const minGapAllowed = -maxOverlap;

      if (idealGap >= FRAME.gapMin) {
        // поместилось с нормальным/положительным gap
        gapPx = Math.min(idealGap, FRAME.gapBase);
      } else if (idealGap >= minGapAllowed) {
        // поместилось, но потребовалось перекрытие (отрицательный gap)
        gapPx = idealGap;
      } else {
        // Даже при максимальном перекрытии не влазит -> уменьшаем widthPx так, чтобы влазило с максимально допустимым перекрытием
        const widthFit = Math.floor((bandW - (n - 1) * minGapAllowed) / n);
        // Не даём width падать ниже минимумов
        widthPx = Math.max(FRAME.minWidthPx, Math.min(wantWpx, widthFit));
        // Пересчитаем ограничения перекрытия для нового width
        const maxOverlap2 = Math.max(0, Math.floor(widthPx * 0.6));
        const minGapAllowed2 = -maxOverlap2;
        const idealGap2 = Math.floor((bandW - n * widthPx) / (n - 1));
        gapPx = Math.max(idealGap2, minGapAllowed2);
      }
    }

    // Применяем стили (CSS gap используем только для положительного spacing, отрицательные — через margin-left)
    const root = getDomHud();
    const rail = root.querySelector("#ginzzzu-portrait-rail") || root;
    // Обновим padding с учётом возможной динамической ширины sidebar (на случай изменения)
    syncSidePadding(root, rail);
    root.style.gap = `${Math.max(0, gapPx)}px`;
    rail.style.gap = `${Math.max(0, gapPx)}px`;

    let porHeight = game.settings.get(MODULE_ID, "portraitHeight");

    if (game.settings.get(MODULE_ID, "gmForcePortraitHeight")) {
      porHeight = game.settings.get(MODULE_ID, "gmPortraitHeight");
    }

    // актуализируем нижний паддинг по настройке
    const bottomOffsetPx = getBottomOffsetPx();
    rail.style.bottom = `${bottomOffsetPx}px`;

    // Коэффициент «доступной высоты» (0..1) относительно всего окна
    const viewportH = Math.max(
      document.documentElement.clientHeight || 0,
      window.innerHeight || 0
    ) || 1;

    const usableFraction = Math.max(
      0,
      Math.min(1, (viewportH - bottomOffsetPx) / viewportH)
    );

    // Итоговая высота портрета = (настройка) * (доступная доля экрана)
    const effectivePorHeight = porHeight * usableFraction;


    // Настройки плашки имени
    let nameV = 50;
    try {
      nameV = Number(game.settings.get(MODULE_ID, "portraitNameVertical") ?? 50);
    } catch (e) {
      nameV = 50;
    }
    nameV = Math.max(0, Math.min(100, nameV));

    let nameFontSize = 25;
    try {
      nameFontSize = Number(game.settings.get(MODULE_ID, "portraitNameFontSize") ?? 25);
    } catch (e) {
      nameFontSize = 25;
    }
    if (!Number.isFinite(nameFontSize)) nameFontSize = 25;
    nameFontSize = Math.max(8, Math.min(72, nameFontSize));

    imgs.forEach((el, i) => {
      const wrapper = el.parentElement;
      if (!wrapper) return;
      
      // Получаем множитель высоты из актёра
      const actorId = el?.dataset?.actorId;
      let heightMultiplier = 1;
      if (actorId) {
        try {
          const actor = game.actors?.get(actorId);
          if (actor) {
            // Сначала получаем базовый множитель портрета
            const portraitMultiplier = foundry.utils.getProperty(actor, FLAG_PORTRAIT_HEIGHT_MULTIPLIER);
            let baseMultiplier = 1;
            if (typeof portraitMultiplier === "number" && Number.isFinite(portraitMultiplier)) {
              baseMultiplier = Math.max(0, portraitMultiplier);
            }
            
            // Затем проверяем множитель эмоции
            const emotionHeightMultiplier = foundry.utils.getProperty(actor, FLAG_EMOTION_HEIGHT_MULTIPLIER);
            if (typeof emotionHeightMultiplier === "number" && Number.isFinite(emotionHeightMultiplier)) {
              // Если эмоция активна, множим оба множителя
              heightMultiplier = Math.max(0, baseMultiplier * emotionHeightMultiplier);
            } else {
              // Если эмоции нет, используем только базовый множитель портрета
              heightMultiplier = baseMultiplier;
            }
          }
        } catch (e) {
          // ignore and use default
        }
      }

      const finalHeight = effectivePorHeight * heightMultiplier;
      
      // Вычисляем offset для компенсации изменения высоты портрета
      // Базовая высота (при heightMultiplier = 1): effectivePorHeight
      // Актуальная высота: finalHeight
      // Разница в высоте: finalHeight - effectivePorHeight = effectivePorHeight * (heightMultiplier - 1)
      // Компенсирующий offset: только положительный (если портрет больше — панель сдвигается вниз)
      const heightDelta = effectivePorHeight * (heightMultiplier - 1);
      const heightOffsetVh = Math.max(0, (heightDelta * 100) / 2);  // только положительный offset вниз
      
      wrapper.style.height    = `${finalHeight * 100}vh`;
      wrapper.style.maxHeight = `${finalHeight * 100}vh`;
      wrapper.style.width     = `${widthPx}px`;
      wrapper.style.maxWidth  = `${widthPx}px`;
      wrapper.style.flex      = "0 0 auto";
      wrapper.style.marginLeft = (i === 0) ? "0px" : `${gapPx}px`;

      // Передаём offset в CSS-переменную для компенсации высоты
      wrapper.style.setProperty("--portrait-height-offset-y", `${heightOffsetVh}vh`);
      
      // Передаём настройки имени в CSS-переменные
      wrapper.style.setProperty("--threeo-portrait-name-top", `${nameV}vh`);
      wrapper.style.setProperty("--threeo-portrait-name-font-size", `${nameFontSize}px`);


      const baseZ = String(100 + i);
      wrapper.dataset.baseZ = baseZ;

      // если портрет сейчас не в фокусе — применяем базовый zIndex;
      // фокусный оставляем выдвинутым вперёд
      const img = wrapper.querySelector("img.ginzzzu-portrait");
      const picActorId = img?.dataset.actorId;
      if (!_focusedActorId || !picActorId || picActorId !== _focusedActorId) {
        wrapper.style.zIndex = getPortraitLayerZIndex(picActorId, baseZ);
      }
    });

    // после перераскладки обновим "тени"/подсветку (на случай изменения порядка)
    _applyPortraitFocus();
    // обновим позиции именных плашек
    try { updateNamePositions(); } catch (e) {}
  }


  // FLIP-анимация сдвига через Web Animations API
  function animateFlip(imgs, firstRects, lastRects) {
    // Pre-calculate all transforms before starting animations
    const animations = imgs.map(el => {
      const first = firstRects.get(el);
      const last = lastRects.get(el);
      if (!first || !last) return null;

      const dx = first.left - last.left;
      const dy = first.top - last.top;
      
      // Get base transform
      const base = getComputedStyle(el).transform;
      const baseTransform = (base && base !== "none") ? base : "none";
      // If the wrapper (or ancestor) is flipped horizontally (scaleX < 0),
      // the horizontal delta should be inverted so the visual direction
      // of the animation matches the actual layout change.
      let dxAdj = dx;
      try {
        const wrapper = el.closest && el.closest('.ginzzzu-portrait-wrapper');
        if (wrapper) {
          const wcs = getComputedStyle(wrapper).transform;
          if (wcs && wcs !== 'none') {
            const m = wcs.match(/matrix(3d)?\(([^)]+)\)/);
            if (m && m[2]) {
              const parts = m[2].split(',').map(s => parseFloat(s.trim()));
              // For both matrix() and matrix3d(), the first element is scaleX (or contains it)
              const scaleX = Number.isFinite(parts[0]) ? parts[0] : 1;
              if (scaleX < 0) dxAdj = -dxAdj;
            }
          }
        }
      } catch (e) {
        // ignore and use unadjusted dx
      }

      // Prepare transforms
      const fromTransform = baseTransform === "none"
        ? `translate3d(${dxAdj}px, ${dy}px, 0)`
        : `${baseTransform} translate3d(${dxAdj}px, ${dy}px, 0)`;
      const toTransform = baseTransform === "none" 
        ? "translate3d(0,0,0)" 
        : baseTransform;

      return { el, fromTransform, toTransform };
    }).filter(Boolean);

    const previousWillChange = new Map();

    // Add will-change before animations
    animations.forEach(({el}) => {
      previousWillChange.set(el, el.style.willChange || "");
      el.style.willChange = "transform";
    });

    // Start all animations
    animations.forEach(({el, fromTransform, toTransform}) => {
      el.animate(
        [
          { transform: fromTransform },
          { transform: toTransform }
        ],
        {
          duration: _ANIM.moveMs,
          easing: _ANIM.easing,
          fill: "both",
          composite: "replace"
        }
      );
    });

    scheduleAfterAnimationSettles(_ANIM.moveMs, () => {
      animations.forEach(({el}) => {
        if (!el.isConnected) return;
        const previous = previousWillChange.get(el);
        if (previous) el.style.willChange = previous;
        else el.style.removeProperty("will-change");
      });
    });
  }

  // Перераскладка ряда с FLIP
  function relayoutDomHud(firstRects /* Map<Element, DOMRect> | undefined */) {
    const root = getDomHud();
    if (!root) return;
    const rail = root.querySelector("#ginzzzu-portrait-rail") || root;

    const imgs = Array.from(rail.querySelectorAll("img.ginzzzu-portrait"));
    const n = imgs.length;
    if (!n) return;

    if (!firstRects) firstRects = collectFirstRects();

    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

    // 1) применяем геометрию (это изменит layout)
    applyGeometry(imgs, vw);

    // 2) снимаем LAST
    const lastRects = new Map();
    imgs.forEach(el => lastRects.set(el, el.getBoundingClientRect()));

    // 3) анимируем сдвиг
    animateFlip(imgs, firstRects, lastRects);
  }

  // Показ одного портрета (создание/обновление DOM + FLIP других)
  async function openLocalPortrait({ actorId, img, name }) {
    if (!actorId || !img) return;

    const root = getDomHud();
    if (!root) return;
    const rail = root.querySelector("#ginzzzu-portrait-rail") || root;

    const map = domStore();
    const existing = map.get(actorId);

    const rawName = typeof name === "string" ? name : "";
    const displayName = _getDisplayName(actorId);
    const safeName = String(displayName || rawName);

    // Уже есть с тем же src — ничего не делаем
    if (existing) {
      const wrapper = existing.closest(".ginzzzu-portrait-wrapper");
      if (wrapper && wrapper.dataset.src === img) {
        existing.style.opacity = "1";
        existing.style.transform = "translateY(0)";
        relayoutDomHud();
        applyPortraitManualTransform(actorId, getPortraitManualTransform(actorId), { root });
        return;
      }
    }

    // FIRST до изменения DOM (для плавного сдвига остальных)
    const firstRects = collectFirstRects();

    if (existing) { try { existing.remove(); } catch {} ; map.delete(actorId); }

    // Preload image before inserting into DOM to avoid flashing broken images
    let finalSrc = img;
    try {
      await _preloadImage(img);
    } catch (e) {
      console.warn("[threeO-portraits] image preload failed for", img, " — using placeholder");
      finalSrc = "icons/svg/mystery-man.svg";
      // attempt to preload placeholder (best-effort)
      try { await _preloadImage(finalSrc); } catch {}
    }

        const el = document.createElement("img");
        el.className = "ginzzzu-portrait";
        el.alt = safeName || "Portrait";
        el.src = finalSrc;
        el.draggable = false;
        el.dataset.actorId = actorId;
        el.dataset.src = img;
        el.dataset.rawName = rawName;

        // Создаем обертку для изображения
        const wrapper = document.createElement("div");
        wrapper.className = "ginzzzu-portrait-wrapper";
        wrapper.dataset.actorId = actorId;
        wrapper.dataset.rawName = rawName;
        wrapper.dataset.displayName = safeName;
        wrapper.dataset.src = img;  // Сохраняем src на wrapper для сравнения

        // позволяем кликать по портрету
        Object.assign(wrapper.style, {
          pointerEvents: "auto",
          transition: `transform ${_ANIM.moveMs}ms ${_ANIM.easing}`
        });
        wrapper.style.setProperty("--ginzzzu-flip-duration", `${Math.max(0, Number(_ANIM.moveMs) || 0)}ms`);
        wrapper.style.setProperty("--ginzzzu-flip-easing", _ANIM.easing || "ease-out");
        updatePortraitReorderCursor(wrapper, actorId);

        const nameMode = game.settings.get(MODULE_ID, "portraitNamesAlwaysVisible") || "hover";

        // Имя — только если оно не пустое и режим не "none"; badges live in names container
        if (safeName && nameMode !== "none") {
          try {
            const root = getDomHud();
            const namesContainer = root ? root.querySelector('#ginzzzu-portrait-names') : null;
            if (namesContainer) {
              const nameBadge = document.createElement("div");
              nameBadge.className = "ginzzzu-portrait-name";
              nameBadge.dataset.actorId = actorId;
              const inner = document.createElement('span');
              inner.className = 'ginzzzu-portrait-name-inner';
              inner.textContent = safeName;
              nameBadge.appendChild(inner);
              namesContainer.appendChild(nameBadge);

              // Hover handlers on wrapper to show/hide badge
              wrapper.addEventListener('mouseenter', () => {
                nameBadge.classList.add('visible');
              }, { passive: true });
              wrapper.addEventListener('mouseleave', () => {
                const rootEl = getDomHud();
                if (rootEl && rootEl.classList.contains('ginzzzu-show-names-always')) return;
                nameBadge.classList.remove('visible');
              }, { passive: true });
            }
          } catch (e) {}
        }

        wrapper.appendChild(el);


    // Базовые стили: рамка фикс. размера; картинка вписывается; плавное появление и «подъём»
    const visualNovelMode = game.settings.get(MODULE_ID, "visualNovelMode");
    if (visualNovelMode) {
      Object.assign(el.style, {
        filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.6)) brightness(var(--tone-brightness,1)) contrast(var(--tone-contrast,1)) saturate(var(--tone-saturate,1)) hue-rotate(180deg) sepia(var(--tone-blue-tint,0)) hue-rotate(var(--tone-blue-post-hue,-180deg))",
        transition: `opacity ${_ANIM.fadeMs}ms ${_ANIM.easing}, transform ${_ANIM.moveMs}ms ${_ANIM.easing}, filter ${_ANIM.moveMs}ms ${_ANIM.easing}`,
        pointerEvents: "none",
        opacity: "0",
        left: "50%",
        // transform: "translate3d(0,12px,0)",
        backfaceVisibility: "hidden",
        transformStyle: "preserve-3d",
        willChange: "transform, opacity",
      });
      el.dataset.baseTransform = el.style.transform || "";
    } else {
      Object.assign(el.style, {
        position: "absolute",
        width: "100%",
        height: "100%",
        objectFit: "contain",
        borderRadius: "10px",
        filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.6)) brightness(var(--tone-brightness,1)) contrast(var(--tone-contrast,1)) saturate(var(--tone-saturate,1)) hue-rotate(180deg) sepia(var(--tone-blue-tint,0)) hue-rotate(var(--tone-blue-post-hue,-180deg))",
        transition: `opacity ${_ANIM.fadeMs}ms ${_ANIM.easing}, transform ${_ANIM.moveMs}ms ${_ANIM.easing}, filter ${_ANIM.moveMs}ms ${_ANIM.easing}`,
        pointerEvents: "none",
        opacity: "0",
        transform: "translate3d(0,12px,0)",
        backfaceVisibility: "hidden",
        transformStyle: "preserve-3d",
        willChange: "transform, opacity"
      });
    }
    // Сохраняем базовый filter, чтобы при фокусе/дефокусе можно было вернуться
    el.dataset.baseFilter = el.style.filter || "";

    // базовый transform для последующего флипа
    el.dataset.baseTransform = el.style.transform || "";

    // начальное состояние флипа:
    // 1) пробуем взять из флагов актёра (как в системе ThreeO)
    // 2) если нет — читаем старый флаг сцены (для совместимости)
    try {
      let isFlippedInitial = false;

      const actor = game.actors?.get(actorId);
      if (actor && foundry?.utils?.hasProperty?.(actor, `flags.${MODULE_ID}.portraitFlipX`)) {
        const v = foundry.utils.getProperty(actor, `flags.${MODULE_ID}.portraitFlipX`);
        isFlippedInitial = !!v;
      } else {
        const scene = canvas?.scene;
        const flippedFlags = scene?.getFlag?.(MODULE_ID, "flipped") || {};
        isFlippedInitial = !!flippedFlags?.[actorId];
      }

      el.dataset.flipped = isFlippedInitial ? "1" : "0";
    } catch (e) {
      el.dataset.flipped = el.dataset.flipped || "0";
    }

    wrapper.addEventListener("auxclick", _onPortraitAuxClick);
    wrapper.addEventListener("contextmenu", _onPortraitClick);
    wrapper.addEventListener("click", _onPortraitCtrlClick);
    wrapper.addEventListener("pointerdown", _onPortraitPointerDown);
    wrapper.addEventListener("dragstart", ev => ev.preventDefault());

    wrapper.appendChild(el);
    insertPortraitWrapperBySharedOrder(rail, wrapper);
    map.set(actorId, el);
    applyPortraitManualTransform(actorId, getPortraitManualTransform(actorId), { root, scheduleNames: false });

    // === Подключение панели эмоций к HUD-портрету ===
    if (globalThis.GinzzzuPortraitEmotions?.attachToolbarToHudWrapper) {
      globalThis.GinzzzuPortraitEmotions.attachToolbarToHudWrapper(wrapper, actorId);
    }
    
    // Перераскладка с учётом нового (FLIP для остальных)
    relayoutDomHud(firstRects);
    // Ensure badges are positioned after layout
    requestAnimationFrame(() => updateNamePositions());

    // Apply blur effect if enabled
    applyBlur();

    if (visualNovelMode) {
      // Ждем полной загрузки изображения в DOM перед анимацией
      el.onload = () => {
        requestAnimationFrame(() => {
          el.style.opacity = "1";
          // VN-режим: transform обычно пустой, но всё равно прогоняем через флип
          _updateImgTransformForFlip(el);
        });
      };
    } else {
      // Ждем полной загрузки изображения в DOM перед анимацией
      el.onload = () => {
        requestAnimationFrame(() => {
          el.style.opacity = "1";
          // после окончательного положения фиксируем базовый transform
          el.style.transform = "translate3d(0,0,0)";
          el.dataset.baseTransform = "translate3d(0,0,0)";
          _updateImgTransformForFlip(el);
        });
      };
    }

    const revealPortrait = el.onload;
    let revealStarted = false;
    el.onload = () => {
      if (revealStarted) return;
      revealStarted = true;
      revealPortrait?.();
    };
    el.onerror = el.onload;
    if (el.complete) el.onload();
  }

  // Скрытие одного портрета и отключение эмоций (удаление DOM + FLIP остальных)
  function closeLocalPortrait(actorId) {
    const map = domStore();
    const el = map.get(actorId);
    if (!el) return;

    if (_focusedActorId === actorId) {
      setSharedPortraitFocus(null);
    }

    const firstRects = collectFirstRects();

    // --- Optionally reset emotion when hiding portrait (guarded by setting) ---
    try {
      // Only perform the reset if the world setting enabled it
      if (game.settings.get(MODULE_ID, "resetEmotionOnHide")) {
        const actor = game.actors?.get(actorId);
        if (actor) {
          const canEdit =
            (game.user?.isGM) ||
            !!actor.isOwner;

          if (canEdit) {
            actor.update({
              [FLAG_PORTRAIT_EMOTION]: null
            }).catch(e => console.error("[ginzzzu-portraits] failed to reset emotion:", e));
          }
        }
      }
    } catch (e) {
      console.error("[ginzzzu-portraits] error clearing emotion flag:", e);
    }

    // Анимация удаляемого
    el.style.transform = "translateY(12px)";
    el.style.opacity = "0";

    const timeout = Math.max(_ANIM.fadeMs, _ANIM.moveMs) + 80;
    setTimeout(() => {
      try {
        const wrapper = el.parentElement;
        if (wrapper && wrapper.classList.contains("ginzzzu-portrait-wrapper")) {
          wrapper.remove();
        } else {
          el.remove();
        }
      } catch {}
      // Also remove name badge if present
      try {
        const root = getDomHud();
        const namesContainer = root ? root.querySelector('#ginzzzu-portrait-names') : null;
        if (namesContainer) {
          const b = namesContainer.querySelector(`.ginzzzu-portrait-name[data-actor-id="${actorId}"]`);
          if (b) b.remove();
        }
      } catch (e) {}
      map.delete(actorId);
      relayoutDomHud(firstRects);
      // Remove blur effect if no more portraits are active
      removeBlur();
    }, timeout);
  }

  async function _applyEmotionImageWithTransition(wrapper, imgEl, newSrc) {
      if (!wrapper || !imgEl || !newSrc) return;

      const duration = Number(game.settings.get(MODULE_ID, "emotionImageTransitionMs")) || 0;

      // If no transition requested, keep original quick behaviour (preload then swap)
      if (!duration) {
        try {
          await _preloadImage(newSrc);
        } catch (e) {
          console.warn("[threeO-portraits] preload failed for emotion image", newSrc, e);
        }
        imgEl.src = newSrc;
        imgEl.dataset.src = newSrc;
        return;
      }

      // Prevent concurrent transitions on same element
      const lockKey = "threeoEmotionTransitionToken";
      const token = String(Date.now()) + ":" + Math.random();
      imgEl.dataset[lockKey] = token;

      const half = Math.max(1, Math.floor(duration / 2));

      // Preserve inline transition & transform so we can restore them later
      const prevTransition = imgEl.style.transition || "";
      const prevTransform = imgEl.style.transform || "";
      // Ensure we add opacity + transform transitions without removing other transitions
      const opacityTransition = `opacity ${half}ms ${_ANIM.easing}`;
      const transformTransition = `transform ${half}ms ${_ANIM.easing}`;
      imgEl.style.transition = prevTransition ? `${prevTransition}, ${opacityTransition}, ${transformTransition}` : `${opacityTransition}, ${transformTransition}`;

      // Ensure will-change set for smoother animation (minimal touch)
      const prevWillChange = imgEl.style.willChange || "";
      try { imgEl.style.willChange = prevWillChange ? `${prevWillChange}, opacity, transform` : "opacity, transform"; } catch (e) {}

      // Helper: wait for opacity transition or timeout
      const awaitOpacity = (timeoutMs) => new Promise((resolve) => {
        let done = false;
        const onEnd = (ev) => {
          if (ev && ev.propertyName && ev.propertyName !== "opacity") return;
          if (done) return;
          done = true;
          clearTimeout(timer);
          imgEl.removeEventListener("transitionend", onEnd);
          resolve();
        };
        imgEl.addEventListener("transitionend", onEnd);
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          imgEl.removeEventListener("transitionend", onEnd);
          resolve();
        }, timeoutMs + 50);
      });

      // Start fade-out
      // If opacity is not explicitly set, compute current computed value then set it inline to ensure transition works
      try {
        const comp = window.getComputedStyle(imgEl).opacity;
        imgEl.style.opacity = comp ?? "1";
      } catch (e) {}

      // Compose a subtle "pose" transform for fade-out so the character appears to shift/pose
      let baseTransform = imgEl.dataset.baseTransform || getComputedStyle(imgEl).transform || "none";
      const extraOut = "translate3d(0,-6px,0) scale(1.03)";
      const composedOut = baseTransform && baseTransform !== "none" ? `${baseTransform} ${extraOut}` : extraOut;

      // Trigger paint then change opacity + transform to start fade-out pose
      await new Promise((r) => requestAnimationFrame(r));
      imgEl.style.transform = composedOut;
      imgEl.style.opacity = "0";

      // Wait for fade-out to complete
      await awaitOpacity(half + 20);

      // If another transition started meanwhile, abort to avoid stomping it
      if (imgEl.dataset[lockKey] !== token) {
        // restore transition/will-change cleanup
        imgEl.style.transition = prevTransition;
        try { imgEl.style.willChange = prevWillChange; } catch (e) {}
        return;
      }

      // Preload new image (best-effort). If preload fails we'll still try to set src.
      try {
        await _preloadImage(newSrc);
      } catch (e) {
        console.warn("[threeO-portraits] preload failed for emotion image", newSrc, e);
      }

      // If token changed while preloading, abort
      if (imgEl.dataset[lockKey] !== token) {
        imgEl.style.transition = prevTransition;
        try { imgEl.style.willChange = prevWillChange; } catch (e) {}
        return;
      }

      // Instead of swapping src on the same <img> (which on some clients briefly shows
      // the new image before the fade-out completes), create an overlay image and
      // cross-fade it in. This keeps the old image visible during out-animation.
      const actorIdForMap = imgEl.dataset.actorId;
      const map = domStore();

      // Create overlay image and copy important attributes/styles
      const newImgEl = document.createElement("img");
      newImgEl.className = imgEl.className || "ginzzzu-portrait";
      newImgEl.alt = imgEl.alt || "Portrait";
      try { newImgEl.style.cssText = imgEl.style.cssText || ""; } catch (e) {}
      // start hidden
      newImgEl.style.opacity = "0";
      newImgEl.style.pointerEvents = "none";
      newImgEl.style.willChange = "transform, opacity";
      newImgEl.dataset.actorId = actorIdForMap;
      newImgEl.dataset.rawName = imgEl.dataset.rawName || "";
      newImgEl.dataset.baseTransform = imgEl.dataset.baseTransform || "";
      newImgEl.dataset.baseFilter = imgEl.dataset.baseFilter || "";
      newImgEl.dataset.src = newSrc;

      // Insert overlay right after the current image so positioning/stacking stays consistent
      try {
        imgEl.parentElement.insertBefore(newImgEl, imgEl.nextSibling);
      } catch (e) {
        imgEl.parentElement.appendChild(newImgEl);
      }

      // Ensure the new element uses the same transition settings we just prepared
      newImgEl.style.transition = imgEl.style.transition || prevTransition;

      // Helper to await opacity transition on arbitrary element
      const awaitOpacityOn = (el, timeoutMs) => new Promise((resolve) => {
        let done = false;
        const onEnd = (ev) => {
          if (ev && ev.propertyName && ev.propertyName !== "opacity") return;
          if (done) return;
          done = true;
          clearTimeout(timer);
          el.removeEventListener("transitionend", onEnd);
          resolve();
        };
        el.addEventListener("transitionend", onEnd);
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          el.removeEventListener("transitionend", onEnd);
          resolve();
        }, timeoutMs + 50);
      });

      // Load the overlay image and wait for it to finish loading (timeout fallback).
      const loadTimeoutMs = Math.max(2000, half * 3);
      const loadedOk = await new Promise((resolve) => {
        let done = false;
        const onLoad = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          newImgEl.removeEventListener("load", onLoad);
          newImgEl.removeEventListener("error", onErr);
          resolve(true);
        };
        const onErr = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          newImgEl.removeEventListener("load", onLoad);
          newImgEl.removeEventListener("error", onErr);
          resolve(false);
        };
        newImgEl.addEventListener("load", onLoad);
        newImgEl.addEventListener("error", onErr);
        // Start loading
        try { newImgEl.src = newSrc; } catch (e) { onErr(); }
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          newImgEl.removeEventListener("load", onLoad);
          newImgEl.removeEventListener("error", onErr);
          resolve(false);
        }, loadTimeoutMs);
      });

      // Force reflow so transitions will apply
      // eslint-disable-next-line no-unused-expressions
      newImgEl.offsetWidth;

      // For fade-in, use a slightly different 'settle' pose so it looks like a changed stance
      const extraIn = "translate3d(0,6px,0) scale(0.985)";
      const composedIn = baseTransform && baseTransform !== "none" ? `${baseTransform} ${extraIn}` : extraIn;

      // Fade in overlay while keeping the old image faded-out. If loading failed/timed out
      // we still perform the transition to avoid leaving the slot empty too long.
      await new Promise((r) => requestAnimationFrame(r));
      newImgEl.style.transform = composedIn;
      newImgEl.style.opacity = "1";

      // Wait for fade-in to complete on the overlay
      await awaitOpacityOn(newImgEl, half + 20);

      // Replace map entry and remove old element
      try {
        imgEl.remove();
      } catch (e) {}
      if (actorIdForMap) map.set(actorIdForMap, newImgEl);

      // Restore transition/will-change on the new element
      newImgEl.style.transition = prevTransition;
      try { newImgEl.style.willChange = prevWillChange; } catch (e) {}

      // Restore prior transform after a tiny delay to avoid abruptly snapping
      setTimeout(() => {
        try { newImgEl.style.transform = prevTransform; } catch (e) {}
      }, 20);

      // Clear lock token
      if (imgEl.dataset[lockKey] === token) delete imgEl.dataset[lockKey];
    }

  // ---- Реакция всех клиентов на смену флага актёра ----
  Hooks.on("updateActor", (actor, changes) => {
    // Проверяем только если FLAG_PORTRAIT_SHOWN РЕАЛЬНО изменился
    const hasFlagChange = foundry.utils.hasProperty(changes, FLAG_PORTRAIT_SHOWN);
    if (!hasFlagChange) return;

    let shown = foundry.utils.getProperty(changes, FLAG_PORTRAIT_SHOWN);
    if (typeof shown === "undefined")
      shown = foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);

    const actorId = actor.id;
    const img = _getActorImage(actor);

    // Берём кастомное имя, если задано
    const name = getActorDisplayName(actor);

    if (shown) {
      openLocalPortrait({ actorId, img, name });
    } else {
      closeLocalPortrait(actorId);
    }
  });
  
  // === Автообновление имён на портретах при rename актёра ===
  Hooks.on("updateActor", (actor, changed) => {
    // console.log("[threeO-portraits] updateActor hook for name change", actor.id, changed);
    const flipFlagPath = `flags.${MODULE_ID}.portraitFlipX`;
    const flipChanged = foundry.utils.hasProperty(changed, flipFlagPath);
    const displayNameChanged =
      ("name" in changed) ||
      foundry.utils.hasProperty(changed, FLAG_DISPLAY_NAME) ||
      foundry.utils.hasProperty(changed, FLAG_PORTRAIT_EMOTION) ||
      foundry.utils.hasProperty(changed, FLAG_CUSTOM_EMOTIONS);

    if (!displayNameChanged && !flipChanged)
      return;

    if (flipChanged) {
      const flip = !!foundry.utils.getProperty(actor, flipFlagPath);
      _setLocalFlipByActorId(actor.id, flip);
    }

    if (!displayNameChanged) return;

    const root = getDomHud?.();
    if (!root) return;

    const actorId = actor.id;
    const wrappers = root.querySelectorAll(".ginzzzu-portrait-wrapper");

    for (const wrapper of wrappers) {
      if (wrapper.dataset.actorId !== actorId) continue;

      const rawName = actor.name || "";
      const displayName = _getDisplayName(actor);

      // сохраняем "сырое" имя и публичное
      wrapper.dataset.rawName = rawName;
      wrapper.dataset.displayName = displayName || "";

      // обновляем текст плашки (badges live in names container)
      try {
        const namesContainer = root.querySelector('#ginzzzu-portrait-names');
        const badge = namesContainer ? namesContainer.querySelector(`.ginzzzu-portrait-name[data-actor-id="${actorId}"]`) : null;
        if (badge) {
          let innerEl = badge.querySelector('.ginzzzu-portrait-name-inner');
          if (!innerEl) {
            innerEl = document.createElement('span');
            innerEl.className = 'ginzzzu-portrait-name-inner';
            badge.textContent = '';
            badge.appendChild(innerEl);
          }
          innerEl.textContent = displayName || rawName || "";
        }
      } catch (e) {}

      // обновляем alt у картинки
      const img = wrapper.querySelector("img.ginzzzu-portrait");
      if (img) {
        img.dataset.rawName = rawName;
        img.alt = displayName || rawName || "Portrait";
      }
    }

    globalThis.GinzzzuPortraits.refreshDisplayNames();
  });

let portraitSocketHandlersRegistered = false;

function registerPortraitSocketHandlers() {
  if (portraitSocketHandlersRegistered || !game.socket) return;
  portraitSocketHandlersRegistered = true;

  game.socket.on(`module.${MODULE_ID}`, (data) => {
    if (!data) return;

    if (data.type === "portraitDragPreview") {
      applyRemotePortraitDragPreview(data);
      return;
    }

    if (data.type === "portraitManualTransform") {
      const actorId = String(data.actorId || "");
      const userId = String(data.userId || "");
      if (data.userId === game.user?.id) return;
      if (data.sceneId && data.sceneId !== canvas?.scene?.id) return;
      if (!actorId || !userId || !canUserReorderPortrait(actorId, userId)) return;

      if (Number.isFinite(Number(data.zIndex))) {
        setPortraitManualZIndex(actorId, Number(data.zIndex));
      }
      applyPortraitManualTransform(actorId, data.transform, {
        animate: !!data.animate
      });
      return;
    }

    if (!game.user?.isGM) return;

    if (data.type === "flipPortrait") {
      const { actorId, isFlipped } = data;
      if (!actorId) return;

      setSharedPortraitFlip(actorId, !!isFlipped);
      return;
    }

    if (data.type === "reorderPortraits") {
      const actorId = String(data.actorId || "");
      const userId = String(data.userId || "");
      if (data.sceneId && data.sceneId !== canvas?.scene?.id) return;
      if (!actorId || !userId || !canUserReorderPortrait(actorId, userId)) return;

      setSharedPortraitSequence(data.sequence, {
        applyLocal: true,
        movedActorId: actorId,
        skipPermissionCheck: true
      });
    }

  });
}

Hooks.once("ready", () => {
  registerPortraitSocketHandlers();

  // log(`Ready. DOM portraits HUD (WAAPI FLIP). MODULE_ID=${MODULE_ID}`);
  try {
    // Skip portrait setup if hidePortraits is enabled for this client
    if (game.settings.get(MODULE_ID, "hidePortraits")) {
      console.log("[ginzzzu-portraits] Portraits are disabled for this client");
      return;
    }

    // Поднимем уже отмеченные портреты (если есть)
    for (const actor of game.actors ?? []) {
      let shown = foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);
      if (typeof shown !== "undefined" && shown) {
        const img = _getActorImage(actor);

        const rawDisplayName = foundry.utils.getProperty(actor, FLAG_DISPLAY_NAME) ?? "";
        const customName = typeof rawDisplayName === "string" ? rawDisplayName : "";
        const name = customName || actor.name || "Portrait";

        openLocalPortrait({ actorId: actor.id, img, name });
      }
    }
    // Apply tone after initial population
    _toneApplyToRootVars();
    // первая раскладка
    setTimeout(() => relayoutDomHud(), 0);
  } catch (e) {
    console.error(e);
  }

    // React to emotion / customEmotions changes to keep portrait image in sync with active emotion
  Hooks.on("updateActor", (actor, changes) => {
    try {
      if (!actor?.id) return;

      // Только если у этого актёра уже есть HUD-портрет
      const root = getDomHud?.();
      if (!root) return;

      const wrapper = root.querySelector(`.ginzzzu-portrait-wrapper[data-actor-id="${actor.id}"]`);
      if (!wrapper) return;

      // Проверяем, что изменилось именно то, что влияет на картинку эмоции
      const emotionChanged = foundry.utils.hasProperty(changes, FLAG_PORTRAIT_EMOTION);
      const customEmotionsChanged = foundry.utils.hasProperty(changes, FLAG_CUSTOM_EMOTIONS);
      const heightMultiplierChanged = foundry.utils.hasProperty(changes, FLAG_PORTRAIT_HEIGHT_MULTIPLIER);
      const emotionHeightMultiplierChanged = foundry.utils.hasProperty(changes, FLAG_EMOTION_HEIGHT_MULTIPLIER);
      const customImageChanged = foundry.utils.hasProperty(changes, FLAG_PORTRAIT_CUSTOM_IMAGE);

      if (!emotionChanged && !customEmotionsChanged && !heightMultiplierChanged && !emotionHeightMultiplierChanged && !customImageChanged) return;

      const imgEl = wrapper.querySelector("img.ginzzzu-portrait");
      if (!imgEl) return;

      const newImg = _getActorImage(actor);
      if (typeof newImg === "string") {
        let resolvedNewImg = newImg;
        try {
          // Resolve relative paths against document base so they compare correctly
          resolvedNewImg = new URL(newImg, document.baseURI).href;
        } catch (e) {
          try { resolvedNewImg = new URL(newImg, window.location.href).href; } catch (e2) {}
        }
        if (imgEl.src !== resolvedNewImg) {
          _applyEmotionImageWithTransition(wrapper, imgEl, newImg);
        }
      }

      // If height multiplier changed, trigger relayout
      if (heightMultiplierChanged || emotionHeightMultiplierChanged) {
        relayoutDomHud();
      }

    } catch (e) {
      console.error("[threeO-portraits] updateActor hook (emotion image) failed:", e);
    }
  });

  // Приём socket-запросов на флип от игроков (обрабатывает только ГМ)
  registerPortraitSocketHandlers();
});

  // Регистрация хукoв и слушателей, которые используют внутренние функции — внутри IIFE
  Hooks.on("canvasReady", () => {
  _toneApplyToRootVars();

    // восстановим флип портретов из флага сцены
     try {
      const flippedAll = canvas?.scene?.getFlag?.(MODULE_ID, "flipped") || {};
      if (flippedAll && typeof flippedAll === "object") {
        for (const [actorId, isFlipped] of Object.entries(flippedAll)) {
        _setLocalFlipByActorId(actorId, !!isFlipped);
        }
       }
      } catch (e2) {
        console.error("[threeO-portraits] canvasReady flip restore error:", e2);
    }
    try {
      applySharedPortraitSequence(getSharedPortraitSequence(), { animate: false });
    } catch (e3) {
      console.error("[threeO-portraits] canvasReady sequence restore error:", e3);
    }
  });

  Hooks.on("updateScene", (scene, diff) => {
    if (scene.id !== canvas?.scene?.id) return;

    if ("darkness" in diff || "environment" in diff) {
      _toneApplyToRootVars();
    }

    const modFlags = diff.flags?.[MODULE_ID];
    if (!modFlags) return;

    // Наш общий фокус: flags[MODULE_ID].focusedActorId
    if (Object.prototype.hasOwnProperty.call(modFlags, "focusedActorId")) {
      const focusedId = modFlags.focusedActorId ?? null;
      setPortraitFocusByActorId(focusedId);
    }

    // Общий флип: flags[MODULE_ID].flipped[actorId]
    if (Object.prototype.hasOwnProperty.call(modFlags, "flipped")) {
      const flippedPatch = modFlags.flipped;
      if (flippedPatch && typeof flippedPatch === "object") {
        for (const [actorId, isFlipped] of Object.entries(flippedPatch)) {
          _setLocalFlipByActorId(actorId, !!isFlipped);
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(modFlags, "portraitSequence")) {
      const sequence = normalizePortraitSequence(modFlags.portraitSequence);
      if (activePortraitDrag) {
        pendingSharedPortraitSequence = sequence;
      } else {
        applySharedPortraitSequence(sequence, { animate: true });
      }
    }
  });

  Hooks.on("lightingRefresh", () => _toneApplyToRootVars());

  // Перераскладка при изменении размера окна
  // Use a debounced handler so rapid resizes trigger a single relayout.
  let __threeo_portraits_resizeTimer = null;
  function _onWindowResizeDebounced() {
    if (__threeo_portraits_resizeTimer) clearTimeout(__threeo_portraits_resizeTimer);
    __threeo_portraits_resizeTimer = setTimeout(() => {
      try {
        const root = getDomHud();
        if (root) {
          const rail = root.querySelector("#ginzzzu-portrait-rail") || root;
          // Ensure padding accounts for current sidebar width before relayout
          syncSidePadding(root, rail);
        }
        // Re-apply adaptive tone vars (in case viewport change affects lighting perception)
        _toneApplyToRootVars();
        relayoutDomHud();
      } catch (e) {
        console.error("[threeO-portraits] resize handler error:", e);
      }
    }, 120);
  }
  window.addEventListener("resize", _onWindowResizeDebounced, { passive: true });
  Hooks.on("canvasReady", () => relayoutDomHud());
  Hooks.on("collapseSidebar", function(a, collapsed) {
    setTimeout(() => relayoutDomHud(), 500);
  });

  // ---- Тоггл из чарника ----
  async function togglePortrait(actorOrId) {
    // Accept either an Actor object or an actor id string (or a token-like wrapper)
    if (!isGM()) return;
    let actor = actorOrId;
    try {
      if (typeof actor === "string") {
        actor = game.actors?.get(actor);
      } else if (actor && typeof actor === "object" && !actor.update && actor.id) {
        // Could be a Token or some wrapper that contains an id
        actor = game.actors?.get(actor.id);
      }
    } catch (e) {
      // ignore and handle below
    }

    if (!actor || typeof actor.update !== "function") {
      console.warn("[threeO-portraits] togglePortrait: actor not found or invalid:", actorOrId);
      return;
    }

    const shown = !!foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);
    try {
      await actor.update({ [FLAG_PORTRAIT_SHOWN]: !shown });
    } catch (e) {
      console.error("[threeO-portraits] togglePortrait error:", e);
    }
  }

    // ---- Тоггл из чарника ----
  function getActorDisplayName(actorOrId) {
    // Accept either an Actor object or an actor id string (or a token-like wrapper)
    let actor = actorOrId;
    try {
      if (typeof actor === "string") {
        actor = game.actors?.get(actor);
      } else if (actor && typeof actor === "object" && !actor.update && actor.id) {
        // Could be a Token or some wrapper that contains an id
        actor = game.actors?.get(actor.id);
      }
    } catch (e) {
      // ignore and handle below
    }

    if (!actor || typeof actor.update !== "function") {
      console.warn("[threeO-portraits] getActorDisplayName: actor not found or invalid:", actorOrId);
      return;
    }

    // 1. Проверяем активную эмоцию и её имя (наивысший приоритет)
    try {
      const currentEmoKey = foundry.utils.getProperty(actor, FLAG_PORTRAIT_EMOTION);
      if (currentEmoKey && currentEmoKey !== "none") {
        // Проверяем, является ли это кастомной эмоцией
        const m = /^custom_(\d+)$/.exec(String(currentEmoKey));
        if (m) {
          const idx = Number(m[1]);
          const customEmotions = foundry.utils.getProperty(actor, FLAG_CUSTOM_EMOTIONS) || [];
          if (Array.isArray(customEmotions) && customEmotions[idx]) {
            const emotionDisplayName = customEmotions[idx].displayName;
            if (typeof emotionDisplayName === "string" && emotionDisplayName.trim().length > 0) {
              return emotionDisplayName.trim();
            }
          }
        }
      }
    } catch (e) {
      console.error("[threeO-portraits] Error checking emotion display name:", e);
    }

    // 2. Проверяем кастомное имя из FLAG_DISPLAY_NAME (средний приоритет)
    const rawDisplayName = foundry.utils.getProperty(actor, FLAG_DISPLAY_NAME) ?? "";
    const customName = typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
    if (customName.length > 0) {
      return customName;
    }

    // 3. Используем реальное имя персонажа (низкий приоритет)
    return actor.name || "Portrait";
  }


  function closeAllLocalPortraits() {
    const ids = Array.from(domStore().keys());
    ids.forEach(id => closeLocalPortrait(id));
  }

  function getActivePortraits() {
    const ids = Array.from(domStore().keys());
    return ids;
  }

  // === Blur Effect Management ===
  // Track timeout for blur removal to allow cancellation on rapid show/hide
  
  function applyBlur() {
    const root = getDomHud();
    if (!root) return;
    if (isPortraitUiHidden(root)) {
      clearPortraitBlur(root);
      return;
    }

    // Cancel any pending blur removal timeout
    if (_blurRemovalTimeout !== null) {
      clearTimeout(_blurRemovalTimeout);
      _blurRemovalTimeout = null;
    }

    const blurEnabled = game.settings.get(MODULE_ID, "portraitBlurEnabled");
    if (!blurEnabled) return;

    const blurStrength = Math.max(1, Math.min(30, Number(game.settings.get(MODULE_ID, "portraitBlurStrength")) || 8));
    const blurSpeed = Math.max(100, Math.min(2000, Number(game.settings.get(MODULE_ID, "portraitBlurSpeed")) || 400));

    root.style.setProperty("--ginzzzu-blur-strength-value", `${blurStrength}px`);
    root.style.setProperty("--ginzzzu-blur-speed-value", `${blurSpeed}ms`);
    root.classList.add("ginzzzu-portrait-blur-active");
  }

  function removeBlur() {
    const root = getDomHud();
    if (!root) return;
    if (isPortraitUiHidden(root)) {
      clearPortraitBlur(root);
      return;
    }

    // Check if there are any active portraits left
    const activePortraits = getActivePortraits();
    if (activePortraits.length > 0) {
      // Still have portraits, keep blur
      return;
    }

    // Cancel any pending removal timeout to avoid conflicts
    if (_blurRemovalTimeout !== null) {
      clearTimeout(_blurRemovalTimeout);
      _blurRemovalTimeout = null;
    }

    // Smoothly transition blur back to 0px
    root.style.setProperty("--ginzzzu-blur-strength-value", "0px");
    
    // Remove class after transition completes to reset everything
    const blurSpeed = Math.max(100, Math.min(2000, Number(game.settings.get(MODULE_ID, "portraitBlurSpeed")) || 400));
    _blurRemovalTimeout = setTimeout(() => {
      root.classList.remove("ginzzzu-portrait-blur-active");
      root.style.removeProperty("--ginzzzu-blur-strength-value");
      root.style.removeProperty("--ginzzzu-blur-speed-value");
      _blurRemovalTimeout = null;
    }, blurSpeed);
  }

  async function changePortraitEmotion(ev, actorOrDoc) {
    const actor = actorOrDoc;
    if (!actor) return;

    // Build list of options: none, standard emotions, custom emotions
    const customEmotions = foundry.utils.getProperty(actor, FLAG_CUSTOM_EMOTIONS) || [];
    const current = foundry.utils.getProperty(actor, FLAG_PORTRAIT_EMOTION) ?? "none";

    const escape = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const options = [];
    // None first
    options.push({ value: "none", label: `${escape(EMOTIONS.none.emoji || "")} ${escape(EMOTIONS.none.label)}`.trim() });

    // Show standard emotions only if actor allows it (flag defaults to true)
    const showStandard = (() => {
      try {
        const raw = foundry.utils.getProperty(actor, FLAG_SHOW_STANDARD_EMOTIONS);
        return raw !== false;
      } catch {
        return true;
      }
    })();

    if (showStandard) {
      for (const [key, preset] of Object.entries(EMOTIONS)) {
        if (key === "none") continue;
        const localized = (function() {
          try { return game.i18n.localize(`GINZZZUPORTRAITS.PortraitToolbar.${preset.label}`) || preset.label; } catch { return preset.label; }
        })();
        options.push({ value: key, label: `${escape(preset.emoji || "")}${preset.emoji ? ' ' : ''}${escape(localized)}` });
      }
    }
    if (Array.isArray(customEmotions) && customEmotions.length) {
      customEmotions.forEach((c, idx) => {
        const key = `custom_${idx}`;
        const name = c.displayName || c.name || (`Custom ${idx+1}`);
        options.push({ value: key, label: `${escape(c.emoji || '•')} ${escape(name)}` });
      });
    }

    const html = `<div class="form-group"><label>${escape(game.i18n.localize('GINZZZUPORTRAITS.changePortraitEmotion') || 'Change emotion')}</label><select id="threeo-change-emo-select" style="width:100%">${options.map(o => `<option value="${o.value}" ${String(o.value) === String(current) ? 'selected' : ''}>${o.label}</option>`).join('')}</select></div>`;

    new Dialog({
      title: game.i18n.localize('GINZZZUPORTRAITS.changePortraitEmotion') || 'Change emotion',
      content: html,
      buttons: {
        ok: {
          icon: '<i class="fas fa-save"></i>',
          label: game.i18n.localize('GINZZZUPORTRAITS.PortraitConfig.save') || 'Save',
          callback: async (dlgHtml) => {
            try {
              const val = dlgHtml.find('#threeo-change-emo-select').val();
              const updateData = {};
              if (!val || val === 'none') {
                updateData[FLAG_PORTRAIT_EMOTION] = null;
                updateData[FLAG_EMOTION_HEIGHT_MULTIPLIER] = null;
              } else if (String(val).startsWith('custom_')) {
                const idx = Number(String(val).split('_')[1] || 0);
                const custom = (Array.isArray(customEmotions) && customEmotions[idx]) ? customEmotions[idx] : null;
                const h = custom && typeof custom.heightMultiplier === 'number' ? custom.heightMultiplier : 1;
                updateData[FLAG_PORTRAIT_EMOTION] = val;
                updateData[FLAG_EMOTION_HEIGHT_MULTIPLIER] = h;
              } else {
                updateData[FLAG_PORTRAIT_EMOTION] = val;
                updateData[FLAG_EMOTION_HEIGHT_MULTIPLIER] = 1;
              }

              await actor.update(updateData);
            } catch (e) {
              console.error('[GinzzzuPortraits] failed to change portrait emotion', e);
            }
          }
        },
        cancel: {
          label: game.i18n.localize('Cancel') || 'Cancel'
        }
      },
      default: 'ok'
    }).render(true);
  }

  // Экспорт
  globalThis.GinzzzuPortraits = {
  togglePortrait,
  configurePortrait,
  changePortraitEmotion,
  getActorDisplayName,
  closeAllLocalPortraits,
  getActivePortraits,
  refreshDisplayNames: refreshPortraitDisplayNames
  };



// === System-agnostic UI controls (directory + token HUD) ===

Hooks.on("getActorContextOptions", async (app, menuItems) => {
  if (!game.user.isGM) {
    return;
  }
  const getActorData = /* @__PURE__ */ __name((target) => {
    return game.actors.get($(target).data("entry-id"));
  }, "getActorData");
  menuItems.splice(
    3,
    0,
    {
      name: "GINZZZUPORTRAITS.configurePortrait",
      condition: /* @__PURE__ */ __name((target) => {
        const actor = getActorData(target);
        return actor;
      }, "condition"),
      icon: '<i class="fas fa-user-edit"></i>',
      callback: /* @__PURE__ */ __name((target) => globalThis.GinzzzuPortraits.configurePortrait(null, getActorData(target)), "callback")
    }
  );

  menuItems.splice(
    4,
    0,
    {
      name: "GINZZZUPORTRAITS.changePortraitEmotion",
      condition: /* @__PURE__ */ __name((target) => {
        const actor = getActorData(target);
        return actor;
      }, "condition"),
      icon: '<i class="fas fa-exchange-alt"></i>',
      callback: /* @__PURE__ */ __name((target) => globalThis.GinzzzuPortraits.changePortraitEmotion(null, getActorData(target)), "callback")
    }
  );
  menuItems.splice(
    3,
    0,
    {
      name: "GINZZZUPORTRAITS.showCharacterPortrait",
      condition: /* @__PURE__ */ __name((target) => {
        const actor = getActorData(target);
        return actor && !globalThis.GinzzzuPortraits.getActivePortraits().includes(actor.id);
      }, "condition"),
      icon: '<i class="fas fa-theater-masks"></i>',
      callback: /* @__PURE__ */ __name((target) => globalThis.GinzzzuPortraits.togglePortrait(getActorData(target)), "callback")
    },
    {
      name: "GINZZZUPORTRAITS.hideCharacterPortrait",
      condition: /* @__PURE__ */ __name((target) => {
        const actor = getActorData(target);
        return actor && globalThis.GinzzzuPortraits.getActivePortraits().includes(actor.id);
      }, "condition"),
      icon: '<i class="fas fa-theater-masks"></i>',
      callback: /* @__PURE__ */ __name((target) => globalThis.GinzzzuPortraits.togglePortrait(getActorData(target)), "callback")
    }
  );
});


Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
    if (!game.user.isGM) {
        return;
    }

    let theatreButtons = [];
    if (app.document.isOwner) {
        // Only prototype actors
        if (!app.document.token) {
            theatreButtons.push({
              action: "configure-theatre",
              label: "",
              class: "configure-theatre",
              icon: "fas fa-user-edit",
              onclick: (ev) => globalThis.GinzzzuPortraits.configurePortrait(ev, app.document.sheet)
            });
        }
        theatreButtons.push({
          action: "add-to-theatre-navbar",
          label: "",
          class: "add-to-theatre-navbar",
          icon: "fas fa-theater-masks",
          onclick: (ev) => globalThis.GinzzzuPortraits.togglePortrait(app.document)
        });

        // Change emotion button
        theatreButtons.push({
          action: "change-portrait-emotion",
          label: "",
          class: "change-portrait-emotion",
          icon: "fas fa-exchange-alt",
          onclick: (ev) => globalThis.GinzzzuPortraits.changePortraitEmotion(ev, app.document)
        });
    }
    buttons.unshift(...theatreButtons);
});

Hooks.on("getHeaderControlsDocumentSheetV2", (app, buttons) => {
  if (!game.user.isGM) {
    return;
  }
  
  let theatreButtons = [];
  if (app.document.isOwner && app.document.documentName === "Actor") {
    if (!app.document.token) {
      theatreButtons.push({
        action: "configure-theatre",
        label: "GINZZZUPORTRAITS.configurePortrait",
        class: "configure-theatre",
        icon: "fas fa-user-edit",
        onClick: /* @__PURE__ */ __name(async (ev) => globalThis.GinzzzuPortraits.configurePortrait(ev, app.document.sheet), "onClick")
      });
    }
    theatreButtons.push({
      action: "add-to-theatre-navbar",
      label: "GINZZZUPORTRAITS.toggleCharacterPortrait",
      class: "add-to-theatre-navbar",
      icon: "fas fa-theater-masks",
      onClick: /* @__PURE__ */ __name(async (ev) => {
        await globalThis.GinzzzuPortraits.togglePortrait(app.document);
      }, "onClick")
    });

    // Change emotion button
    theatreButtons.push({
      action: "change-portrait-emotion",
      label: "GINZZZUPORTRAITS.changePortraitEmotion",
      class: "change-portrait-emotion",
      icon: "fas fa-exchange-alt",
      onClick: /* @__PURE__ */ __name(async (ev) => globalThis.GinzzzuPortraits.changePortraitEmotion(ev, app.document), "onClick")
    });
  }
  buttons.unshift(...theatreButtons);
});

function normalizePortraitSequence(sequence) {
  if (!Array.isArray(sequence)) return [];

  const seen = new Set();
  const normalized = [];

  for (const actorId of sequence) {
    const id = String(actorId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function getSharedPortraitSequence() {
  try {
    return normalizePortraitSequence(canvas?.scene?.getFlag?.(MODULE_ID, "portraitSequence") || []);
  } catch (e) {
    return [];
  }
}

function getCurrentPortraitSequence() {
  const root = getDomHud();
  if (!root) return [];

  const rail = getPortraitRail(root);
  const imgs = Array.from(rail.querySelectorAll("img.ginzzzu-portrait"));

  return normalizePortraitSequence(imgs.map(img => img.dataset.actorId).filter(Boolean));
}

function getShownPortraitActorIds() {
  const ids = [];

  try {
    for (const actor of game.actors ?? []) {
      if (foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN)) ids.push(actor.id);
    }
  } catch (e) {}

  return normalizePortraitSequence(ids);
}

function sanitizeSharedPortraitSequence(sequence) {
  const current = getCurrentPortraitSequence();
  const allowedIds = new Set([...getShownPortraitActorIds(), ...current]);
  const sanitized = normalizePortraitSequence(sequence).filter(actorId => allowedIds.has(actorId));

  for (const actorId of current) {
    if (!sanitized.includes(actorId)) sanitized.push(actorId);
  }

  return sanitized;
}

function applySharedPortraitSequence(sequence = getSharedPortraitSequence(), { animate = true } = {}) {
  const normalized = normalizePortraitSequence(sequence);

  const root = getDomHud();
  if (!root || !normalized.length) return false;

  if (activePortraitDrag) {
    pendingSharedPortraitSequence = normalized;
    return false;
  }

  const rail = getPortraitRail(root);
  if (!rail) return false;

  const wrappers = Array.from(rail.querySelectorAll(".ginzzzu-portrait-wrapper"));
  if (!wrappers.length) return false;

  const byActorId = new Map(wrappers.map(wrapper => [wrapper.dataset.actorId, wrapper]));
  const ordered = normalized
    .map(actorId => byActorId.get(actorId))
    .filter(Boolean);

  const orderedSet = new Set(ordered);
  for (const wrapper of wrappers) {
    if (!orderedSet.has(wrapper)) ordered.push(wrapper);
  }

  const changed = ordered.some((wrapper, index) => wrappers[index] !== wrapper);
  if (!changed) {
    scheduleNamePositionsUpdate();
    return false;
  }

  const firstRects = animate ? collectFirstRects() : null;
  for (const wrapper of ordered) {
    rail.appendChild(wrapper);
  }

  if (animate) relayoutDomHud(firstRects);
  else relayoutDomHud();

  scheduleNamePositionsUpdate();
  return true;
}

function setSharedPortraitSequence(sequence, {
  applyLocal = false,
  movedActorId = null,
  userId = game.user?.id,
  skipPermissionCheck = false
} = {}) {
  if (!skipPermissionCheck && movedActorId && !canUserReorderPortrait(movedActorId, userId)) return;

  const sanitized = sanitizeSharedPortraitSequence(sequence);
  const serialized = JSON.stringify(sanitized);

  if (applyLocal) {
    applySharedPortraitSequence(sanitized, { animate: true });
  }

  if (!game.user?.isGM) {
    try {
      game.socket?.emit?.(`module.${MODULE_ID}`, {
        type: "reorderPortraits",
        actorId: movedActorId,
        userId: game.user?.id,
        sceneId: canvas?.scene?.id,
        sequence: sanitized
      });
    } catch (e) {
      console.error("[threeO-portraits] reorder socket emit failed:", e);
    }
    return;
  }

  const scene = canvas?.scene;
  if (!scene) return;

  const currentSerialized = JSON.stringify(getSharedPortraitSequence());
  if (serialized === currentSerialized) return;

  scene.update({ [`flags.${MODULE_ID}.portraitSequence`]: sanitized }).catch(e => {
    console.error("[threeO-portraits] setSharedPortraitSequence error:", e);
  });
}

function setSyncedPortraitManualTransform(actorId, transform, {
  applyLocal = false,
  userId = game.user?.id,
  skipPermissionCheck = false,
  animate = false,
  zIndex = null
} = {}) {
  const id = String(actorId || "").trim();
  if (!id) return;
  if (!skipPermissionCheck && !canUserReorderPortrait(id, userId)) return;

  const normalized = normalizePortraitManualTransform(transform);

  if (applyLocal) {
    if (Number.isFinite(Number(zIndex))) setPortraitManualZIndex(id, Number(zIndex));
    applyPortraitManualTransform(id, normalized, { animate });
  }

  try {
    game.socket?.emit?.(`module.${MODULE_ID}`, {
      type: "portraitManualTransform",
      actorId: id,
      userId: game.user?.id,
      sceneId: canvas?.scene?.id,
      transform: normalized,
      animate: !!animate,
      zIndex: Number.isFinite(Number(zIndex)) ? Number(zIndex) : null
    });
  } catch (e) {
    console.error("[threeO-portraits] portrait transform socket emit failed:", e);
  }
}

Hooks.once("ready", () => {
  requestAnimationFrame(() => applySharedPortraitSequence(getSharedPortraitSequence(), { animate: false }));
});

})();
