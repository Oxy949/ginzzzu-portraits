import { MODULE_ID, FLAG_MODULE, FLAG_PORTRAIT_SHOWN, FLAG_CUSTOM_EMOTIONS, FLAG_DISPLAY_NAME, FLAG_PORTRAIT_EMOTION } from "../core/constants.js";
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
      if (!m) return baseImg;

      const idx = Number(m[1]);
      if (!Number.isInteger(idx) || idx < 0) return baseImg;

      const customEmotions = foundry.utils.getProperty(actor, FLAG_CUSTOM_EMOTIONS) || [];
      if (!Array.isArray(customEmotions) || !customEmotions[idx]) return baseImg;

      const path = customEmotions[idx]?.imagePath;
      if (typeof path === "string" && path.trim().length > 0) {
        return path.trim();
      }
    } catch (e) {
      console.error("[threeO-portraits] Failed to resolve custom emotion image:", e);
    }

    return baseImg;
  }

  // ---- Adaptive tone (по темноте сцены) ----
function _toneGetDarkness() {
  // 0..1 — чем больше, тем темнее; поддержка V10..V12
  try {
    const scene = canvas?.scene;
    if (!scene) return 0;
    const d = (scene.environment?.darkness ?? scene.darkness ?? 0);
    return Math.max(0, Math.min(1, Number(d) || 0));
  } catch (e) { return 0; }
}


function _toneCompute(darkness, strength01) {
  // strength01: 0..1
  // Подбор “на глаз”: чуть приглушаем в темноте
  const s = Math.min(1, Math.max(0, strength01));
  const k  = darkness * s;

  // коэффициенты (1 = без изменений)
  const brightness = 1 - 0.35 * k;   // темнее
  const contrast   = 1 + 0.18 * k;   // немного контраста
  const saturate   = 1 - 0.20 * k;   // убрать “кислотность” в сумраке
  // лёгкий сдвиг в более “холодные” тона к ночи
  const hueDeg     = -10 * (k > 0.5 ? (k - 0.5) * 2 : 0); // от 0 до ~-10°

  return { brightness, contrast, saturate, hueDeg };
}

function _toneApplyToRootVars() {
  const enabled = game.settings.get(MODULE_ID, "portraitToneEnabled");
  const root = document.getElementById("ginzzzu-portrait-layer");
  if (!root) return;
  if (!enabled) {
    root.style.removeProperty("--tone-brightness");
    root.style.removeProperty("--tone-contrast");
    root.style.removeProperty("--tone-saturate");
    root.style.removeProperty("--tone-hue");
    return;
  }
  const strength = Math.max(0, Math.min(1, Number(game.settings.get(MODULE_ID, "portraitToneStrength")) || 0));
  const d = _toneGetDarkness();
  const { brightness, contrast, saturate, hueDeg } = _toneCompute(d, strength);
  root.style.setProperty("--tone-brightness", String(brightness));
  root.style.setProperty("--tone-contrast",   String(contrast));
  root.style.setProperty("--tone-saturate",   String(saturate));
  root.style.setProperty("--tone-hue",        `${hueDeg}deg`);
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

  // Simple image preloader with timeout
  function _preloadImage(src, timeoutMs = 6000) {
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
      img.onload = () => onDone();
      img.onerror = (e) => onDone(new Error("Image load error"));
      // try set crossOrigin to allow CORS'd images where possible
      try { img.crossOrigin = "anonymous"; } catch {}
      img.src = src;
      const timer = setTimeout(() => onDone(new Error("Image preload timeout")), timeoutMs);
    });
  }

  // ---- DOM HUD внутри #interface ----
  function getDomHud() {
    let root = document.getElementById("ginzzzu-portrait-layer");
    if (root) return root;

    const iface = document.getElementById("interface");
    if (!iface) {
      console.warn("[threeO-portraits] #interface not found; abort DOM HUD");
      return null;
    }

    root = document.createElement("div");
    root.id = "ginzzzu-portrait-layer";

    // Вешаем класс для режима "всегда показывать имена"
    if (game.settings.get(MODULE_ID, "portraitNamesAlwaysVisible")) {
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

    // Установить paddingLeft/paddingRight с учётом ширины #sidebar
    syncSidePadding(root, rail);

    document.getElementById("interface").appendChild(root);
    return root;
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
    const wrappers = _getAllWrappers();
    for (const wrapper of wrappers) {
      const actorId = wrapper.dataset.actorId || "";
      const displayName = _getDisplayName(actorId);
      const rawName = wrapper.dataset.rawName ?? "";
      const safeName = String(displayName || rawName);

      wrapper.dataset.displayName = safeName;

      // Работаем с плашкой имени
      let badge = wrapper.querySelector(".ginzzzu-portrait-name");
      if (!safeName && badge) {
        // Имя стало пустым — удаляем плашку
        badge.remove();
        badge = null;
      } else if (safeName && !badge) {
        // Имя появилось — создаём плашку
        badge = document.createElement("div");
        badge.className = "ginzzzu-portrait-name";
        wrapper.appendChild(badge);
      }
      if (badge) {
        badge.textContent = safeName;
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
        wrapper.style.zIndex = wrapper.dataset.baseZ || wrapper.style.zIndex;

        img.style.filter = `${img.dataset.baseFilter} brightness(${dimBrightness}) saturate(${dimSaturate})`;

      } else {
        // Фокуса нет — вернуть всё как было
        wrapper.classList.remove("ginzzzu-portrait-focused", "ginzzzu-portrait-dimmed");

        if (wrapper.dataset.baseZ) {
          wrapper.style.zIndex = wrapper.dataset.baseZ;
        }
        if (img.dataset.baseFilter) {
          img.style.filter = img.dataset.baseFilter;
        }
      }
    }
  }

  // --- Флип портрета (горизонтальное отражение) ---

  // Обновляем визуальный флип через класс на wrapper
  function _updateImgTransformForFlip(img) {
    if (!img) return;
    const wrapper = img.closest(".ginzzzu-portrait-wrapper");
    if (!wrapper) return;

    const isFlipped = img.dataset.flipped === "1";

    // навешиваем/снимаем класс, сам transform перенесём в CSS
    wrapper.classList.toggle("ginzzzu-portrait-flipped", isFlipped);
  }


  // локальное применение флипа по actorId (без записи в сцену)
  function _setLocalFlipByActorId(actorId, isFlipped) {
    if (!actorId) return;
    const map = domStore();
    const img = map.get(actorId);
    if (!img) return;

    img.dataset.flipped = isFlipped ? "1" : "0";
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

    // актуализируем боковые паддинги
    syncSidePadding(root, rail);

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
      
      wrapper.style.height    = `${effectivePorHeight * 100}vh`;
      wrapper.style.maxHeight = `${effectivePorHeight * 100}vh`;
      wrapper.style.width     = `${widthPx}px`;
      wrapper.style.maxWidth  = `${widthPx}px`;
      wrapper.style.flex      = "0 0 auto";
      wrapper.style.marginLeft = (i === 0) ? "0px" : `${gapPx}px`;

      // Передаём значение в CSS как переменную
      wrapper.style.setProperty("--threeo-portrait-name-top", `${nameV}%`);
      
      // Передаём настройки имени в CSS-переменные
      wrapper.style.setProperty("--threeo-portrait-name-top", `${nameV}%`);
      wrapper.style.setProperty("--threeo-portrait-name-font-size", `${nameFontSize}px`);


      const baseZ = String(100 + i);
      wrapper.dataset.baseZ = baseZ;

      // если портрет сейчас не в фокусе — применяем базовый zIndex;
      // фокусный оставляем выдвинутым вперёд
      const img = wrapper.querySelector("img.ginzzzu-portrait");
      const actorId = img?.dataset.actorId;
      if (!_focusedActorId || !actorId || actorId !== _focusedActorId) {
        wrapper.style.zIndex = baseZ;
      }
    });

    // после перераскладки обновим "тени"/подсветку (на случай изменения порядка)
    _applyPortraitFocus();
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

    // Add will-change before animations
    animations.forEach(({el}) => {
      el.style.willChange = "transform";
    });

    // Start all animations
    const promises = animations.map(({el, fromTransform, toTransform}) => {
      const anim = el.animate(
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
      return anim.finished;
    });

    // Remove will-change after all animations complete
    Promise.all(promises).then(() => {
      animations.forEach(({el}) => {
        el.style.willChange = "auto";
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
      try { await _preloadImage(finalSrc, 2000); } catch {}
    }

        const el = document.createElement("img");
        el.className = "ginzzzu-portrait";
        el.alt = safeName || "Portrait";
        el.src = finalSrc;
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
          cursor: "pointer",
          transition: `transform ${_ANIM.moveMs}ms ${_ANIM.easing}`
        });

        // Имя, всплывающее при наведении — только если оно не пустое
        if (safeName) {
          const nameBadge = document.createElement("div");
          nameBadge.className = "ginzzzu-portrait-name";
          nameBadge.textContent = safeName;
          wrapper.appendChild(nameBadge);
        }

        wrapper.appendChild(el);


    // Базовые стили: рамка фикс. размера; картинка вписывается; плавное появление и «подъём»
    if (game.settings.get(MODULE_ID, "visualNovelMode")) {
      Object.assign(el.style, {
        filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.6)) brightness(var(--tone-brightness,1)) contrast(var(--tone-contrast,1)) saturate(var(--tone-saturate,1)) hue-rotate(var(--tone-hue,0deg))",
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
        filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.6)) brightness(var(--tone-brightness,1)) contrast(var(--tone-contrast,1)) saturate(var(--tone-saturate,1)) hue-rotate(var(--tone-hue,0deg))",
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

    wrapper.appendChild(el);
    rail.appendChild(wrapper);
    map.set(actorId, el);

    // === Подключение панели эмоций к HUD-портрету ===
    if (globalThis.GinzzzuPortraitEmotions?.attachToolbarToHudWrapper) {
      globalThis.GinzzzuPortraitEmotions.attachToolbarToHudWrapper(wrapper, actorId);
    }
    
    // Перераскладка с учётом нового (FLIP для остальных)
    relayoutDomHud(firstRects);

    if (game.settings.get(MODULE_ID, "visualNovelMode")) {
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
          el.dataset.baseTransform = "translateY(0)";
          _updateImgTransformForFlip(el);
        });
      };
    }
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
      map.delete(actorId);
      relayoutDomHud(firstRects);
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
    // Нас интересует только изменение имени
    if (!("name" in changed) && !foundry.utils.hasProperty(changed, FLAG_MODULE)) 
      return;

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

      // обновляем текст плашки
      const badge = wrapper.querySelector(".ginzzzu-portrait-name");
      if (badge) {
        badge.textContent = displayName || rawName || "";
      }

      // обновляем alt у картинки
      const img = wrapper.querySelector("img.ginzzzu-portrait");
      if (img) {
        img.dataset.rawName = rawName;
        img.alt = displayName || rawName || "Portrait";
      }
    }

    // --- Обновление флипа HUD-портрета по флагу актёра ---
    const flipChanged = foundry.utils.hasProperty(
      changed,
      `flags.${MODULE_ID}.portraitFlipX`
    );
    if (flipChanged) {
      const flip = !!foundry.utils.getProperty(
        actor,
        `flags.${MODULE_ID}.portraitFlipX`
      );
      _setLocalFlipByActorId(actor.id, flip);
    }

    globalThis.GinzzzuPortraits.refreshDisplayNames();
  });


Hooks.once("ready", () => {
  // log(`Ready. DOM portraits HUD (WAAPI FLIP). MODULE_ID=${MODULE_ID}`);
  try {
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

      if (!emotionChanged && !customEmotionsChanged) return;

      const imgEl = wrapper.querySelector("img.ginzzzu-portrait");
      if (!imgEl) return;

      const newImg = _getActorImage(actor);
      console.log("[threeO-portraits] updating emotion image for actor", imgEl.src, " newImg=", newImg);
      if (typeof newImg === "string" && newImg) {
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

    } catch (e) {
      console.error("[threeO-portraits] updateActor hook (emotion image) failed:", e);
    }
  });

  // Приём socket-запросов на флип от игроков (обрабатывает только ГМ)
  if (game.socket) {
    game.socket.on(`module.${MODULE_ID}`, (data) => {
      if (!data || data.type !== "flipPortrait") return;
      if (!game.user?.isGM) return;

      const { actorId, isFlipped } = data;
      if (!actorId) return;

      setSharedPortraitFlip(actorId, !!isFlipped);
    });
  }
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
  });

  Hooks.on("updateScene", (scene, diff) => {
    if (scene.id !== canvas?.scene?.id) return;

    if ("darkness" in diff || "environment" in diff || "flags" in diff) {
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

    const rawDisplayName = foundry.utils.getProperty(actor, FLAG_DISPLAY_NAME) ?? "";
    const customName = typeof rawDisplayName === "string" ? rawDisplayName : "";
    const name = customName || actor.name || "Portrait";
    return name;
  }


  function closeAllLocalPortraits() {
    const ids = Array.from(domStore().keys());
    ids.forEach(id => closeLocalPortrait(id));
  }

  function getActivePortraits() {
    const ids = Array.from(domStore().keys());
    return ids;
  }

  // Экспорт
  globalThis.GinzzzuPortraits = {
  togglePortrait,
  configurePortrait,
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
              label: "GINZZZUPORTRAITS.configurePortrait",
              class: "configure-theatre",
              icon: "fas fa-user-edit",
              onclick: (ev) => globalThis.GinzzzuPortraits.configurePortrait(ev, app.document.sheet)
            });
        }
        theatreButtons.push({
          action: "add-to-theatre-navbar",
          label: "GINZZZUPORTRAITS.toggleCharacterPortrait",
          class: "add-to-theatre-navbar",
          icon: "fas fa-theater-masks",
          onclick: (ev) => globalThis.GinzzzuPortraits.togglePortrait(app.document)
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
  }
  buttons.unshift(...theatreButtons);
});

// Add a function to save the current portrait sequence to module settings
function savePortraitSequence() {
  const root = getDomHud();
  if (!root) return;

  const rail = root.querySelector("#ginzzzu-portrait-rail") || root;
  const imgs = Array.from(rail.querySelectorAll("img.ginzzzu-portrait"));

  const sequence = imgs.map(img => img.dataset.actorId).filter(Boolean);
  game.settings.set(MODULE_ID, "portraitSequence", sequence);
}

// Add a function to load the portrait sequence from module settings
function loadPortraitSequence() {
  const sequence = game.settings.get(MODULE_ID, "portraitSequence") || [];
  const root = getDomHud();
  if (!root) return;

  const rail = root.querySelector("#ginzzzu-portrait-rail") || root;
  const map = domStore();

  sequence.forEach(actorId => {
    const img = map.get(actorId);
    if (img) {
      rail.appendChild(img.closest(".ginzzzu-portrait-wrapper"));
    }
  });

  relayoutDomHud();
}

// Hook into the ready event to load the sequence on startup
Hooks.once("ready", () => {
  loadPortraitSequence();

  // Save the sequence whenever the DOM HUD is relaid out
  Hooks.on("canvasReady", savePortraitSequence);
  Hooks.on("updateActor", savePortraitSequence);
});

})();
