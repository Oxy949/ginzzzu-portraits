import { MODULE_ID, FLAG_MODULE, FLAG_PORTRAIT_SHOWN, FLAG_DISPLAY_NAME } from "../core/constants.js";

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

(()=>{
  // Preferable actor image property paths (configurable)
  function _parsePathsCSV(v) {
    return String(v ?? "").split(",").map(s => s.trim()).filter(Boolean);
  }
  function _getActorImage(actor) {
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
const log = (...a) => console.log("%c[threeO-portraits]", "color:#7cf", ...a);

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

  // Respect system "prefers-reduced-motion"
  const REDUCE_MOTION = !!(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  // Wrap ANIM getters so they respect reduced motion
  const _ANIM = {
    get fadeMs() { return REDUCE_MOTION ? 0 : ANIM.fadeMs; },
    get moveMs() { return REDUCE_MOTION ? 0 : ANIM.moveMs; },
    get easing()  { return ANIM.easing ?? "ease"; }
  };

  const isGM = () => !!game.user?.isGM;

  // Для уважения системной настройки "уменьшение движения"
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    ANIM.fadeMs = 0;
    ANIM.moveMs = 0;
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
      paddingBottom: `${FRAME.bottomPx}px`,
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
        bottom: "0",
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
        bottom: "0",
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
      const rawName = wrapper.dataset.rawName;

      wrapper.dataset.displayName = displayName || "";

      const badge = wrapper.querySelector(".ginzzzu-portrait-name");
      if (badge) {
        badge.textContent = displayName || rawName || "";
      }

      // alt тоже можно освежить
      const img = wrapper.querySelector("img.ginzzzu-portrait");
      if (img) {
        img.dataset.rawName = rawName;
        img.alt = displayName || rawName || "Portrait";
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
      
      wrapper.style.height    = `${porHeight * 100}vh`;
      wrapper.style.maxHeight = `${porHeight * 100}vh`;
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
      
      // Prepare transforms
      const fromTransform = baseTransform === "none"
        ? `translate3d(${dx}px, ${dy}px, 0)`
        : `${baseTransform} translate3d(${dx}px, ${dy}px, 0)`;
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

    const displayName = _getDisplayName(name || ""); 

    // Уже есть с тем же src — показать и переложить
    if (existing && existing.dataset.src === img) {
      existing.style.opacity = "1";
      existing.style.transform = "translateY(0)";
      relayoutDomHud();
      return;
    }

    // FIRST до изменения DOM (для плавного сдвига остальных)
    const firstRects = collectFirstRects();

    if (existing) { try { existing.remove(); } catch {} ; map.delete(actorId); }

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
    el.alt = displayName || name || "Portrait";
    el.src = finalSrc;
    el.dataset.actorId = actorId;
    el.dataset.src = img;
    el.dataset.rawName = name || "";

    // Создаем обертку для изображения
    const wrapper = document.createElement("div");
    wrapper.className = "ginzzzu-portrait-wrapper";
    wrapper.dataset.actorId = actorId;
    wrapper.dataset.rawName = name || "";
    wrapper.dataset.displayName = displayName || "";

    // позволяем кликать по портрету
    Object.assign(wrapper.style, {
      pointerEvents: "auto",
      cursor: "pointer",
      transition: `transform ${_ANIM.moveMs}ms ${_ANIM.easing}`
    });

    // Имя, всплывающее при наведении
    const nameBadge = document.createElement("div");
    nameBadge.className = "ginzzzu-portrait-name";
    nameBadge.textContent = displayName || name || "";
    wrapper.appendChild(nameBadge);

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

    wrapper.addEventListener("auxclick", _onPortraitAuxClick);

    wrapper.appendChild(el);
    rail.appendChild(wrapper);
    map.set(actorId, el);

    // Перераскладка с учётом нового (FLIP для остальных)
    relayoutDomHud(firstRects);

    if (game.settings.get(MODULE_ID, "visualNovelMode")) {
      // Ждем полной загрузки изображения в DOM перед анимацией
      el.onload = () => {
        requestAnimationFrame(() => {
          el.style.opacity = "1";
        });
      };
    } else {
      // Ждем полной загрузки изображения в DOM перед анимацией
      el.onload = () => {
        requestAnimationFrame(() => {
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
        });
      };
    // если уже есть активный фокус, обновим состояние "в тени" / "подсветка"
    if (_focusedActorId) {
      _applyPortraitFocus();
    }
    }
  }

  // Скрытие одного портрета (удаление DOM + FLIP остальных)
  function closeLocalPortrait(actorId) {
    const map = domStore();
    const el = map.get(actorId);
    if (!el) return;

    // если закрываем портрет, который был в фокусе — снять фокус
    if (_focusedActorId === actorId) {
      setSharedPortraitFocus(null);
    }

    // FIRST до изменения DOM (для плавного сдвига остальных)
    const firstRects = collectFirstRects();

    // Анимация удаляемого (CSS-transition)
    el.style.transform = "translateY(12px)";
    el.style.opacity = "0";

    const timeout = Math.max(_ANIM.fadeMs, _ANIM.moveMs) + 80; // чуть больше — надёжнее
    setTimeout(() => {
      try { 
        // Удаляем обертку вместе с изображением
        const wrapper = el.parentElement;
        if (wrapper && wrapper.classList.contains('ginzzzu-portrait-wrapper')) {
          wrapper.remove();
        } else {
          el.remove();
        }
      } catch {}
      map.delete(actorId);

      // Переложим оставшихся по снятому FIRST (FLIP через WAAPI)
      relayoutDomHud(firstRects);
    }, timeout);
  }

  // ---- Реакция всех клиентов на смену флага актёра ----
  Hooks.on("updateActor", (actor, changes) => {
    if (!foundry.utils.hasProperty(changes, FLAG_PORTRAIT_SHOWN))
      return;

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
    console.log("[threeO-portraits] updateActor hook for name change", actor.id, changed);
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

    globalThis.GinzzzuPortraits.refreshDisplayNames();
  });


  Hooks.once("ready", () => {
    log(`Ready. DOM portraits HUD (WAAPI FLIP). MODULE_ID=${MODULE_ID}`);
    try {
      // Поднимем уже отмеченные портреты (если есть)
      for (const actor of game.actors ?? []) {
        let shown = foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);
        if (typeof shown !== "undefined" && shown) {
          const img = _getActorImage(actor);

          const rawDisplayName = foundry.utils.getProperty(actor, FLAG_DISPLAY_NAME) ?? "";
          const customName = typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
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
  });


  // Регистрация хукoв и слушателей, которые используют внутренние функции — внутри IIFE
  Hooks.on("canvasReady", () => {
  _toneApplyToRootVars();

    try {
      const focusedId = canvas?.scene?.getFlag?.(MODULE_ID, "focusedActorId");
      if (focusedId) {
        setPortraitFocusByActorId(focusedId);
      } else {
        setPortraitFocusByActorId(null);
      }
    } catch (e) {
      console.error("[threeO-portraits] canvasReady focus error:", e);
    }
  });
  Hooks.on("updateScene", (scene, diff) => {
    if (scene.id !== canvas?.scene?.id) return;

    if ("darkness" in diff || "environment" in diff || "flags" in diff) {
      _toneApplyToRootVars();
    }

    // Наш общий фокус: flags[MODULE_ID].focusedActorId
    const modFlags = diff.flags?.[MODULE_ID];
    if (modFlags && Object.prototype.hasOwnProperty.call(modFlags, "focusedActorId")) {
      const focusedId = modFlags.focusedActorId ?? null;
      setPortraitFocusByActorId(focusedId);
    }
  });

  Hooks.on("lightingRefresh", () => _toneApplyToRootVars());

  // Перераскладка при изменении размера окна
  window.addEventListener("resize", () => relayoutDomHud());
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

    const rawDisplayName = foundry.utils.getProperty(actor, FLAG_DISPLAY_NAME) ?? "";
    const customName = typeof rawDisplayName === "string" ? rawDisplayName : "";
    const name = customName || actor.name || "Portrait";
    return name;
  }

  // ---- Конфигурация из чарника ----
  async function configurePortrait(ev, actorSheet) {
    if (!isGM()) return;
    ev?.preventDefault?.();

    const actor = actorSheet?.actor ?? actorSheet?.document ?? actorSheet;
    if (!actor) {
      console.warn("[threeO-portraits] configurePortrait: actor not found", actorSheet);
      return;
    }

    // Берём текущее кастомное имя через foundry.utils.getProperty + константу
    const currentRaw  = foundry.utils.getProperty(actor, FLAG_DISPLAY_NAME);
    const currentName = typeof currentRaw === "string" ? currentRaw : "";

    const safeValue   = currentName.replace(/"/g, "&quot;");
    const placeholder = (actor.name ?? "").replace(/"/g, "&quot;");

    const content = `
      <form class="ginzzzu-portrait-config">
        <div class="form-group">
          <label>Отображаемое имя портрета</label>
          <input type="text" name="displayName" value="${safeValue}" placeholder="${placeholder}">
          <p class="notes">
            Это имя будет использоваться в уведомлениях и может отличаться от системного имени актёра.
            Оставьте поле пустым, чтобы использовать имя актёра.
          </p>
        </div>
      </form>`;

    return new Promise((resolve) => {
      new Dialog({
        title: `Портрет: имя для игроков — ${actor.name}`,
        content,
        buttons: {
          clear: {
            icon: '<i class="fas fa-eraser"></i>',
            label: "Сбросить",
            callback: async () => {
              await actor.unsetFlag(MODULE_ID, "displayName");
              resolve();
            }
          },
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: game.i18n.localize("Save"),
            callback: async (html) => {
              const input = html.find('input[name="displayName"]').val();
              const value = String(input ?? "");

              if (!value) {
                await actor.unsetFlag(MODULE_ID, "displayName");
              } else {
                await actor.setFlag(MODULE_ID, "displayName", value);
              }
              resolve();
            }
          }
        },
        default: "save",
        close: () => resolve()
      }).render(true);
    });
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

Hooks.on("getHeaderControlsActorSheetV2", (app, buttons) => {
  if (!game.user.isGM) {
    return;
  }
  const removeLabelSheetHeader = false;
  let theatreButtons = [];
  if (app.document.isOwner) {
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

})();
