import { MODULE_ID, DOCK_ID, FLAG_PORTRAIT_SHOWN, FLAG_FAVORITE, FLAG_MODULE } from "../core/constants.js";
import { addNpcDockOptions, filterNpcs, getFilterCriteria } from "./systems/index.js";

(()=>{
  // ── Actor type utilities (configurable) ─────────────────────────────────────
  function parseCSVTypes(v) {
    return new Set(String(v ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
  }
  function getNPCTypes() {
    try { return parseCSVTypes(game.settings.get(MODULE_ID, "npcActorTypes")); } catch { return parseCSVTypes("npc, adversary, creature, monster, minion"); }
  }
  function getPCTypes() {
    try { return parseCSVTypes(game.settings.get(MODULE_ID, "pcActorTypes")); } catch { return parseCSVTypes("character, pc, hero, player"); }
  }
  function isNPC(a) {
    const t = String(a?.type ?? "").toLowerCase();
    const types = getNPCTypes();
    return types.size ? types.has(t) : true; // empty means 'any'
  }
  function isPC(a) {
    const t = String(a?.type ?? "").toLowerCase();
    const types = getPCTypes();
    return types.size ? types.has(t) : true;
  }


  // ── SETTINGS (client) ────────────────────────────────────────────────────────
  Hooks.once("init", () => {
    game.settings.register(MODULE_ID, "npcDockSort",    { scope: "client", config: false, type: String, default: "name-asc" });
    game.settings.register(MODULE_ID, "npcDockFolder",  { scope: "client", config: false, type: String, default: "all" });
    game.settings.register(MODULE_ID, "npcDockSearch",  { scope: "client", config: false, type: String, default: "" });
    game.settings.register(MODULE_ID, "npcDockCollapsed", { scope: "client", config: false, type: Boolean, default: false });
  });

  const getSortMode   = () => { try { return game.settings.get(MODULE_ID, "npcDockSort")   || "name-asc"; } catch { return "name-asc"; } };
  const setSortMode   = (v) => { try { game.settings.set(MODULE_ID, "npcDockSort",   v); } catch {} };
  const getFolderSel  = () => { try { return game.settings.get(MODULE_ID, "npcDockFolder") || "all"; } catch { return "all"; } };
  const setFolderSel  = (v) => { try { game.settings.set(MODULE_ID, "npcDockFolder", v); } catch {} };
  const getSearchText = () => { try { return game.settings.get(MODULE_ID, "npcDockSearch") || ""; } catch { return ""; } };
  const setSearchText = (v) => { try { game.settings.set(MODULE_ID, "npcDockSearch", v); } catch {} };
  const getIsCollapsed = () => { try { return game.settings.get(MODULE_ID, "npcDockCollapsed"); } catch { return false; } };
  const setIsCollapsed = (v) => { try { game.settings.set(MODULE_ID, "npcDockCollapsed", v); } catch {} };
  const getShowActivePortraits = () => { try { return !!game.settings.get(MODULE_ID, "showActivePortraits"); } catch { return true; } };
  const setShowActivePortraits = (v) => { try { game.settings.set(MODULE_ID, "showActivePortraits", !!v); } catch {} };
  const getPCFolderSel  = () => { try { return game.settings.get(MODULE_ID, "pcDockFolder") || "all"; } catch { return "all"; } };
  const setPCFolderSel  = (v) => { try { game.settings.set(MODULE_ID, "pcDockFolder", v); } catch {} };
  const getNpcDockWidth = () => { try { return game.settings.get(MODULE_ID, "npcDockWidth") || 40; } catch { return 40; } };
  const getNpcDockRows = () => {
    try {
      const value = Number(game.settings.get(MODULE_ID, "npcDockRows")) || 1;
      return Math.max(1, Math.min(5, Math.trunc(value)));
    } catch {
      return 1;
    }
  };

  const NPC_DOCK_CARD_SIZE = 100;
  const NPC_DOCK_GAP = 8;

  // Helper to apply NPC dock layout settings
  function applyNpcDockLayout() {
    const root = document.getElementById(DOCK_ID);
    if (root) {
      const width = getNpcDockWidth();
      const rows = getNpcDockRows();
      const height = rows * NPC_DOCK_CARD_SIZE + Math.max(0, rows - 1) * NPC_DOCK_GAP;
      root.style.width = `${width}vw`;
      root.style.setProperty("--ginzzzu-npc-dock-rows", String(rows));
      root.style.setProperty("--ginzzzu-npc-dock-height", `${height}px`);
      root.style.setProperty("--ginzzzu-npc-dock-grid-rows", `repeat(${rows}, ${NPC_DOCK_CARD_SIZE}px)`);
    }
  }

  // Контролы
    let searchEl;
    let sortEl;
    let folderEl;
    let clearBtn;

  // ── COLORS (folder-based) ────────────────────────────────────────────────────
  function hexToRgb(hex) {
    if (!hex) return null;
    const m = String(hex).trim().replace("#", "");
    const v = m.length === 3 ? m.split("").map(x=>x+x).join("") : m;
    const int = parseInt(v, 16);
    if (Number.isNaN(int)) return null;
    return { r: (int>>16)&255, g: (int>>8)&255, b: int&255 };
  }
  function rgbaStr(rgb, a=0.35) { if (!rgb) return ""; return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`; }
  function relLuma({r,g,b}) {
    const c = [r,g,b].map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
  }
  function getActorFolderColor(actor) {
    let f = actor?.folder ?? null;
    while (f) { if (f.color) return f.color; f = f.folder ?? null; }
    return null;
  }

  // ── FOLDERS / TOOLTIP / PATH ────────────────────────────────────────────────
  function getFolderPath(actor) {
    const names = [];
    let f = actor?.folder ?? null;
    while (f) { names.unshift(f.name || ""); f = f.folder ?? null; }
    return names.join(" / ");
  }

  function makeTooltip(actor) {
    // Берём кастомное отображаемое имя, если оно есть
    const name = (actor.name || "");

    // Если имени нет вообще — не показываем подсказку
    if (!name) return "";

    const folderPath = getFolderPath(actor);
    return folderPath ? `${name}\n${folderPath}` : name;
  }

  function collectActorFoldersWithPC() {
    const actors = (game.actors?.contents ?? []).filter(a => isPC(a));
    const usedFolderIds = new Set();
    for (const a of actors) {
      let f = a.folder ?? null;
      while (f) { usedFolderIds.add(f.id); f = f.folder ?? null; }
    }
    const folders = (game.folders?.filter(f => f.type === "Actor") ?? [])
      .filter(f => usedFolderIds.has(f.id))
      .map(f => ({ id: f.id, name: f.name, path: getFolderPath({ folder: f }) || f.name }));
    folders.sort((x,y) => (x.path||"").localeCompare(y.path||"", game.i18n.lang || undefined, { sensitivity:"base" }));
    return folders;
  }

  function collectActorFoldersWithNPC() {
    const actors = (game.actors?.contents ?? []).filter(a => isNPC(a));
    const usedFolderIds = new Set();
    for (const a of actors) {
      let f = a.folder ?? null;
      while (f) { usedFolderIds.add(f.id); f = f.folder ?? null; }
    }
    const folders = (game.folders?.filter(f => f.type === "Actor") ?? [])
      .filter(f => usedFolderIds.has(f.id))
      .map(f => ({ id: f.id, name: f.name, path: getFolderPath({ folder: f }) || f.name }));
    folders.sort((x,y) => (x.path||"").localeCompare(y.path||"", game.i18n.lang || undefined, { sensitivity:"base" }));
    return folders;
  }

  // ── DOM ─────────────────────────────────────────────────────────────────────
  function ensureDock() {
    let root = document.getElementById(DOCK_ID);
    if (root) return root;

    // Корень
    root = document.createElement("div");
    root.id = DOCK_ID;
    root.style.display = "none";
    document.body.appendChild(root);

    // Apply NPC dock layout settings
    applyNpcDockLayout();

    // Mini dock container (CSS handles layout) — shows currently active portraits as circles
    const mini = document.createElement("div");
    mini.className = "active-portraits";
    // visibility controlled by user setting
    mini.style.display = getShowActivePortraits() ? "" : "none";
    root.appendChild(mini);

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const isCollapsed = getIsCollapsed();
    toolbar.innerHTML = `
      <div class="left">
        <input id="ginzzzu-npc-search" type="text" placeholder="${game.i18n.localize("GINZZZUPORTRAITS.searchNPC")}">
      </div>
      <div class="right">
        <label>${game.i18n.localize("GINZZZUPORTRAITS.sorting")}</label>
        <select id="ginzzzu-npc-sort">
          <option value="name-asc">${game.i18n.localize("GINZZZUPORTRAITS.sortByName")}</option>
          <option value="folder-asc">${game.i18n.localize("GINZZZUPORTRAITS.sortByFolder")}</option>
        </select>

        <label>${game.i18n.localize("GINZZZUPORTRAITS.displaySrc")}</label>
        <select id="ginzzzu-npc-folder">
          <option value="from-scene">${game.i18n.localize("GINZZZUPORTRAITS.fromScene")}</option>
          <option value="all">${game.i18n.localize("GINZZZUPORTRAITS.allFolders")}</option>
        </select>
        <button class="clear-all" id="ginzzzu-npc-clear" title="${game.i18n.localize("GINZZZUPORTRAITS.hideAllPortraits")}">🧹</button>
        <button class="collapse-btn" id="ginzzzu-npc-collapse" title="${isCollapsed ? game.i18n.localize("GINZZZUPORTRAITS.showPanelUI") : game.i18n.localize("GINZZZUPORTRAITS.hidePanelUI")}">
          <i class="fas ${isCollapsed ? 'fa-expand' : 'fa-compress'}"></i>
        </button>
      </div>
    `;
    root.appendChild(toolbar);

    // Контент: players + NPC (избранные отдельной колонкой)
    const content = document.createElement("div");
    content.className = "content";

    if (game.settings.get(MODULE_ID, "playerCharactersPanelEnabled")) {
      content.innerHTML = `
        <div class="players"></div>
        <div class="npc-favs" style="display:none"></div>
        <div class="npcs"><div class="rail"></div></div>
      `;
    } else {
      content.innerHTML = `
        <div class="players" style="display:none; visibility:hidden;"></div>
        <div class="npc-favs" style="display:none"></div>
        <div class="npcs"><div class="rail"></div></div>
      `;
    }
    root.appendChild(content);



    // wheel: если над блоком игроков или избранных — крутим ВЕРТИКАЛЬНО,
    // иначе крутим ГОРИЗОНТАЛЬНО основную ленту NPC
    root.addEventListener("wheel", (ev) => {
      const players = root.querySelector(".players");
      const favs    = root.querySelector(".npc-favs");
      const npcsRail = root.querySelector(".npcs .rail");
      if (!players || !npcsRail) return;

      const over = (el) => {
        if (!el) return false;
        // Prefer containment check (more robust when elements are transformed
        // or when the event target is a child element). Fallback to rect check.
        if (ev.target instanceof Node && el.contains(ev.target)) return true;
        const r = el.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right &&
               ev.clientY >= r.top  && ev.clientY <= r.bottom;
      };

      // Normalize delta across devices/modes (lines/pages)
      let delta = ev.deltaY || 0;
      if (ev.deltaMode === 1) delta *= 16; // DOM_DELTA_LINE ~ 16px
      else if (ev.deltaMode === 2) delta *= window.innerHeight; // DOM_DELTA_PAGE

      if (over(players) || over(favs)) {
        if (!delta) return;
        ev.preventDefault();
        const target = over(players) ? players : favs;
        target.scrollTop += delta;
      } else {
        if (!delta) return;
        ev.preventDefault();
        npcsRail.scrollLeft += delta;
      }
    }, { passive: false, capture: true });



    // Контекстное меню карточек отключаем (ПКМ — открыть лист)
    root.addEventListener("contextmenu", (ev) => {
      if ((ev.target instanceof HTMLElement) && ev.target.closest(`#${DOCK_ID} .item`)) {
        ev.preventDefault();
      }
    });
    
    searchEl = toolbar.querySelector("#ginzzzu-npc-search");
    sortEl   = toolbar.querySelector("#ginzzzu-npc-sort");
    folderEl = toolbar.querySelector("#ginzzzu-npc-folder");
    clearBtn = toolbar.querySelector("#ginzzzu-npc-clear");

    searchEl.value = getSearchText();
    sortEl.value   = getSortMode();
    folderEl.value = getFolderSel();

    searchEl.addEventListener("input", (e) => { setSearchText(e.target.value || ""); scheduleRebuild(0); });
    sortEl.addEventListener("change", (e) => { setSortMode(e.target.value); scheduleRebuild(0); });
    folderEl.addEventListener("change", (e) => { setFolderSel(e.target.value || "all"); scheduleRebuild(0); });

    clearBtn.addEventListener("click", async (e) => { e.preventDefault(); await hideAllPortraitsAllActors(); });

    // Collapse button functionality
    const collapseBtn = toolbar.querySelector("#ginzzzu-npc-collapse");
    collapseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const isCollapsed = !getIsCollapsed();
      setIsCollapsed(isCollapsed);
      root.classList.toggle("collapsed", isCollapsed);
      collapseBtn.title = isCollapsed ? game.i18n.localize("GINZZZUPORTRAITS.showPanelUI") : game.i18n.localize("GINZZZUPORTRAITS.hidePanelUI");
      collapseBtn.querySelector("i").className = `fas ${isCollapsed ? 'fa-expand' : 'fa-compress'}`;
    });

    // Apply initial collapsed state
    root.classList.toggle("collapsed", getIsCollapsed());

    return root;
  }

  // Обновить список опций папок
  function refreshFolderSelectOptions() {
    const root = ensureDock();
    const sel = root.querySelector("#ginzzzu-npc-folder");
    if (!sel) return;
    const current = getFolderSel();

    // Базовые источники
    sel.innerHTML = `
      <option value="from-scene">${game.i18n.localize("GINZZZUPORTRAITS.fromScene")}</option>
      <option value="all">${game.i18n.localize("GINZZZUPORTRAITS.allFolders")}</option>
    `;

    // Далее — папки с NPC
    const list = collectActorFoldersWithNPC();
    for (const f of list) {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.path || f.name || "(без имени)";
      sel.appendChild(opt);
    }
    
    addNpcDockOptions(sel);    

    sel.value = current;
    if (sel.value !== current) { sel.value = "all"; setFolderSel("all"); }
  }

  // Клик по карточке: toggle флага (общая для NPC/PLAYER)
  async function onCardClickToggle(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
    // Если карточка в процессе перетаскивания — игнорируем клик
    if (btn?.dataset?.dragging) return;
    const actor = game.actors.get(btn.dataset.actorId);
    if (!actor) return;
    const isShown = !!foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);
    try { await actor.update({ [FLAG_PORTRAIT_SHOWN]: !isShown }); }
    catch (e) { console.error("[threeO-dock] toggle error:", e); }
  }
  // ПКМ по карточке: открыть лист
  function onCardRightMouse(ev) {
    if (ev.button !== 2) return;
    ev.preventDefault();
    const btn = ev.currentTarget;
    const actor = game.actors.get(btn.dataset.actorId);
    if (actor) setTimeout(() => actor.sheet?.render(true), 100);
  }

  // СКМ (колёсико) по карточке NPC — пометить/снять избранное
  async function onCardMiddleFav(ev) {
    if (ev.button !== 1) return;
    ev.preventDefault();
    ev.stopPropagation();
    const btn = ev.currentTarget;
    const actor = game.actors.get(btn.dataset.actorId);
    if (!actor) return;
    const isFav = !!foundry.utils.getProperty(actor, FLAG_FAVORITE);
    try {
      const animationClass = isFav ? 'removing-from-favorites' : 'adding-to-favorites';
      // Добавляем соответствующий класс анимации
      btn.classList.add(animationClass);
      // Ждем окончания анимации перед обновлением
      await new Promise(resolve => setTimeout(resolve, 100));
      await actor.update({ [FLAG_FAVORITE]: !isFav });
      scheduleRebuild(0);
      // Удаляем класс анимации
      btn.classList.remove(animationClass);
    } catch (e) {
      console.error("[threeO-dock] fav toggle error:", e);
      btn.classList.remove('adding-to-favorites');
      btn.classList.remove('removing-from-favorites');
    }
  }

  // Drag-and-drop: allow dragging an actor card onto the canvas to spawn a token
  function onCardDragStart(ev) {
    const btn = ev.currentTarget;
    const actor = game.actors.get(btn.dataset.actorId);
    if (!actor) return;
    // mark as dragging so click handlers can ignore the click
    try { btn.dataset.dragging = "1"; } catch(e) {}
    try {
      const data = { type: "Actor", id: actor.id, uuid: actor.uuid };
      ev.dataTransfer.setData("text/plain", JSON.stringify(data));
      ev.dataTransfer.effectAllowed = "copy";
      const img = btn.querySelector("img");
      if (img) {
        // Use the portrait as the drag image if available
        try { ev.dataTransfer.setDragImage(img, (img.width||32)/2, (img.height||32)/2); } catch(e) {}
      }
    } catch (e) {
      console.warn("[threeO-dock] dragstart error:", e);
    }
  }

  function onCardDragEnd(ev) {
    const btn = ev.currentTarget;
    try { delete btn.dataset.dragging; } catch(e) { btn.removeAttribute && btn.removeAttribute('data-dragging'); }
  }

  // Построить карточки players (type "player") с учетом фильтра по папке
  function buildPlayers(container) {
    container.innerHTML = "";
    let pcs = (game.actors?.contents ?? []).filter(a => isPC(a));

    // Фильтр по выбранной папке игроков
    const pcFolderSel = getPCFolderSel();
    if (pcFolderSel === "no-folder") {
      // только игроки без папки
      pcs = pcs.filter(a => !a.folder);
    } else if (pcFolderSel !== "all") {
      // только игроки из выбранной папки (учитывая вложенность)
      pcs = pcs.filter(a => {
        let f = a.folder ?? null;
        while (f) {
          if (f.id === pcFolderSel) return true;
          f = f.folder ?? null;
        }
        return false;
      });
    }
    // порядок: сначала избранное, потом по имени
    pcs.sort((a, b) => {
      // сначала по избранному
      const aFav = !!foundry.utils.getProperty(a, `flags.${MODULE_ID}.pcFavorite`);
      const bFav = !!foundry.utils.getProperty(b, `flags.${MODULE_ID}.pcFavorite`);
      if (aFav !== bFav) return bFav ? 1 : -1;
      // затем по имени
      return (a.name||"").localeCompare(b.name||"", game.i18n.lang || undefined, { sensitivity:"base" });
    });
    for (const a of pcs) {
      const btn = document.createElement("div");
      btn.className = "item";
      btn.dataset.actorId = a.id;
      btn.title = makeTooltip(a);
      // PC favorite flag (middle click)
      const FLAG_FAV_PC = `flags.${MODULE_ID}.pcFavorite`;

      const img = document.createElement("img");
      img.src = a.img || a.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";
      img.alt = a.name || "Player";
      btn.appendChild(img);

      // Make card draggable to allow dropping an Actor onto the canvas
      btn.draggable = true;
      btn.addEventListener("dragstart", onCardDragStart);
      btn.addEventListener("dragend", onCardDragEnd);

      const shown = !!foundry.utils.getProperty(a, FLAG_PORTRAIT_SHOWN);
      if (shown) btn.classList.add("is-on");

      // PC favorite visual
      if (foundry.utils.getProperty(a, FLAG_FAV_PC)) {
        btn.classList.add("is-fav");
        const star = document.createElement("div");
        star.className = "fav-star";
        star.textContent = "★";
        btn.appendChild(star);
      }

      const folderHex = getActorFolderColor(a);
      if (folderHex) {
        const rgb = hexToRgb(folderHex);
        btn.style.setProperty("--folder-bg",     rgbaStr(rgb, 0.35));
        btn.style.setProperty("--folder-color",  rgbaStr(rgb, 0.8));
        const l = relLuma(rgb);
        btn.style.setProperty("--folder-shadow", `0 6px 16px rgba(0,0,0,${l>0.6?0.35:0.55})`);
      }

      btn.addEventListener("click", onCardClickToggle);
      btn.addEventListener("mousedown", onCardRightMouse);
      // middle-click to toggle pc favorite
      btn.addEventListener("mousedown", async (ev) => {
        if (ev.button !== 1) return;
        ev.preventDefault();
        ev.stopPropagation();
        const isFav = !!foundry.utils.getProperty(a, `flags.${MODULE_ID}.pcFavorite`);
        try {
          const animationClass = isFav ? 'removing-from-favorites' : 'adding-to-favorites';
          ev.currentTarget.classList.add(animationClass);
          await new Promise(resolve => setTimeout(resolve, 100));
          await a.update({ [`flags.${MODULE_ID}.pcFavorite`]: !isFav });
           scheduleRebuild(0); 
          } catch (e) {
             console.error(e);
          }
      });

      container.appendChild(btn);
    }
  }

    // Построить карточки NPC (с учётом фильтров, БЕЗ избранных — они в отдельной колонке)
  function buildNPCs(containerRail) {
    if (!containerRail) return;
    containerRail.classList.remove("is-empty");
    containerRail.innerHTML = "";

    let npcs = (game.actors?.contents ?? []).filter(a => isNPC(a));

    // фильтр по источнику (папка / со сцены / все)
    const folderSel = getFolderSel();
    if (folderSel === "from-scene") {
      const tokens = canvas?.tokens?.placeables ?? [];
      const actorIdsOnScene = new Set(
        tokens.map(t => t?.actor?.id || t?.document?.actorId || t?.actorId).filter(Boolean)
      );
      npcs = npcs.filter(a => actorIdsOnScene.has(a.id));
    } else if (folderSel !== "all") {
      const filterCriteria = getFilterCriteria(folderSel);
      if (filterCriteria) {
        npcs = filterNpcs(filterCriteria, npcs);
      } else {
        npcs = npcs.filter(a => {
          let f = a.folder ?? null;
          while (f) { if (f.id === folderSel) return true; f = f.folder ?? null; }
          return false;
        });
      }
    }

    // поиск
    const q = (getSearchText() || "").trim().toLowerCase();
    if (q) {
      npcs = npcs.filter(a => {
        const name = (a.name || "").toLowerCase();
        const path = (getFolderPath(a) || "").toLowerCase();
        return name.includes(q) || path.includes(q);
      });
    }

    if (!npcs.length) {
      containerRail.classList.add("is-empty");
      containerRail.innerHTML = `<div class="empty">${game.i18n.localize("GINZZZUPORTRAITS.noNPCFound")}</div>`;
      return;
    }

    // разделяем на избранных и остальных
    const rest = [];
    for (const a of npcs) {
      if (!foundry.utils.getProperty(a, FLAG_FAVORITE)) rest.push(a);
    }

    // если все совпадающие оказались избранными — основная лента пустая
    if (!rest.length) {
      containerRail.classList.add("is-empty");
      containerRail.innerHTML = `<div class="empty">${game.i18n.localize("GINZZZUPORTRAITS.allInFavorites") || "Все подходящие NPC отмечены ★ и показаны в колонке избранных"}</div>`;
      return;
    }

    // сортировка остальных
    const mode = getSortMode();
    if (mode === "folder-asc") {
      rest.sort((a, b) => {
        const pa = getFolderPath(a), pb = getFolderPath(b);
        const byFolder = (pa || "").localeCompare(pb || "", game.i18n.lang || undefined, { sensitivity:"base" });
        if (byFolder !== 0) return byFolder;
        return (a.name||"").localeCompare(b.name||"", game.i18n.lang || undefined, { sensitivity:"base" });
      });
    } else {
      rest.sort((a, b) =>
        (a.name||"").localeCompare(b.name||"", game.i18n.lang || undefined, { sensitivity:"base" })
      );
    }

    // рендер только обычных NPC
    for (const a of rest) {
      const btn = document.createElement("div");
      btn.className = "item";
      btn.dataset.actorId = a.id;
      btn.title = makeTooltip(a);

      const img = document.createElement("img");
      img.src = a.img || a.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";
      img.alt = a.name || "NPC";
      btn.appendChild(img);

      const displayName = globalThis.GinzzzuPortraits.getActorDisplayName(a);
      const label = document.createElement("div");
      label.className = "npc-label";
      label.textContent = displayName || "";
      btn.appendChild(label);

      const shown = !!foundry.utils.getProperty(a, FLAG_PORTRAIT_SHOWN);
      if (shown) btn.classList.add("is-on");

      const folderHex = getActorFolderColor(a);
      if (folderHex) {
        const rgb = hexToRgb(folderHex);
        btn.style.setProperty("--folder-bg",     rgbaStr(rgb, 0.35));
        btn.style.setProperty("--folder-color",  rgbaStr(rgb, 0.8));
        const l = relLuma(rgb);
        btn.style.setProperty("--folder-shadow", `0 6px 16px rgba(0,0,0,${l>0.6?0.35:0.55})`);
      }

      // draggable
      btn.draggable = true;
      btn.addEventListener("dragstart", onCardDragStart);
      btn.addEventListener("dragend", onCardDragEnd);

      btn.addEventListener("click", onCardClickToggle);
      btn.addEventListener("mousedown", onCardRightMouse);
      btn.addEventListener("mousedown", onCardMiddleFav);  // СКМ — пометить избранным

      containerRail.appendChild(btn);
    }
  }


    // Отдельная колонка избранных NPC — маленькие портреты, вертикальный скролл
  function buildNPCFavs(containerFavs) {
    if (!containerFavs) return;

    // собираем ТОЛЬКО избранных NPC (независимо от фильтров)
    let favs = (game.actors?.contents ?? [])
      .filter(a => isNPC(a) && !!foundry.utils.getProperty(a, FLAG_FAVORITE));

    if (!favs.length) {
      containerFavs.style.display = "none";
      containerFavs.innerHTML = "";
      return;
    }

    // сортируем по имени
    favs.sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", game.i18n.lang || undefined, { sensitivity: "base" })
    );

    containerFavs.style.display = "";
    containerFavs.innerHTML = "";

    for (const a of favs) {
      const btn = document.createElement("div");
      btn.className = "item";
      btn.dataset.actorId = a.id;
      btn.title = makeTooltip(a);

      const img = document.createElement("img");
      img.src = a.img || a.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";
      img.alt = a.name || "NPC";
      btn.appendChild(img);

      // включён ли портрет
      if (foundry.utils.getProperty(a, FLAG_PORTRAIT_SHOWN)) {
        btn.classList.add("is-on");
      }

      // звездочка для наглядности
      const star = document.createElement("div");
      star.className = "fav-star";
      star.textContent = "★";
      btn.appendChild(star);

      const folderHex = getActorFolderColor(a);
      if (folderHex) {
        const rgb = hexToRgb(folderHex);
        btn.style.setProperty("--folder-bg",    rgbaStr(rgb, 0.35));
        btn.style.setProperty("--folder-color", rgbaStr(rgb, 0.8));
        const l = relLuma(rgb);
        btn.style.setProperty("--folder-shadow", `0 6px 16px rgba(0,0,0,${l>0.6?0.35:0.55})`);
      }

      // draggable
      btn.draggable = true;
      btn.addEventListener("dragstart", onCardDragStart);
      btn.addEventListener("dragend", onCardDragEnd);

      btn.addEventListener("click", onCardClickToggle);
      btn.addEventListener("mousedown", onCardRightMouse);
      btn.addEventListener("mousedown", onCardMiddleFav); // СКМ — снять/поставить ★

      containerFavs.appendChild(btn);
    }
  }


    // Мини-док: кружочки текущих активных портретов (и NPC, и PC)
    function buildMiniDock() {
      const root = ensureDock();
      const mini = root.querySelector('.active-portraits');
      if (!mini) return;
      mini.innerHTML = "";

      // собираем актёров с поднятым флагом портрета
      let active = (game.actors?.contents ?? []).filter(a => !!foundry.utils.getProperty(a, FLAG_PORTRAIT_SHOWN) && (isNPC(a) || isPC(a)));
      if (!active.length) {
        mini.style.display = 'none';
        return;
      }
      active.sort((a,b) => (a.name||"").localeCompare(b.name||"", game.i18n.lang || undefined, { sensitivity: 'base' }));
      mini.style.display = '';

      for (const a of active) {
        const btn = document.createElement('div');
        btn.className = 'dock-icon';
        btn.dataset.actorId = a.id;
        btn.title = makeTooltip(a) || (a.name || "");

        const img = document.createElement('img');
        img.src = a.img || a.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg';
        img.alt = a.name || '';
        img.draggable = false;
        btn.appendChild(img);

        // favorite badge (if set)
        if (foundry.utils.getProperty(a, FLAG_FAVORITE)) {
          const f = document.createElement('div');
          f.className = 'fav';
          f.textContent = '★';
          btn.appendChild(f);
        }

        // Left click: toggle portrait (hide)
        btn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          const actor = game.actors.get(btn.dataset.actorId);
          if (!actor) return;
          const shown = !!foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);
          try { await actor.update({ [FLAG_PORTRAIT_SHOWN]: !shown }); } catch(e) { console.error('[threeO-dock] mini toggle error', e); }
        });

        // Right click: open actor sheet (like main panel)
        btn.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const actor = game.actors.get(btn.dataset.actorId);
          if (actor) setTimeout(() => actor.sheet?.render(true), 50);
        });

        mini.appendChild(btn);
      }
    }


  // Построение всего дока
  function buildDock() {
    if (!game.user?.isGM) return;
    const root = ensureDock();
    applyNpcDockLayout();
    // rebuild mini-dock first so it's visible above the toolbar (only if enabled)
    try { if (getShowActivePortraits()) buildMiniDock(); } catch(e) { /* ignore */ }
    refreshFolderSelectOptions();

    const playersBox = root.querySelector(".players");
    const npcFavsBox = root.querySelector(".npc-favs");
    const npcRail    = root.querySelector(".npcs .rail");

    if (playersBox && game.settings.get(MODULE_ID, "playerCharactersPanelEnabled")) {
      buildPlayers(playersBox);
    } else if (playersBox) {
      playersBox.innerHTML = "";
    }

    if (npcFavsBox) buildNPCFavs(npcFavsBox);
    buildNPCs(npcRail);

    // Attach per-container wheel handlers once so scrolling works even if
    // some other listener stops propagation. These handlers normalize deltaMode
    // and perform programmatic scroll on the element under the pointer.
    if (!root.__threeOWheelAttached) {
      const attachWheel = (el, vertical = true) => {
        if (!el) return;
        el.addEventListener("wheel", function(ev) {
          let delta = ev.deltaY || 0;
          if (ev.deltaMode === 1) delta *= 16;
          else if (ev.deltaMode === 2) delta *= window.innerHeight;
          if (!delta) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (vertical) this.scrollTop += delta;
          else this.scrollLeft += delta;
        }, { passive: false });
      };

      attachWheel(playersBox, true);
      attachWheel(npcFavsBox, true);
      attachWheel(npcRail, false);
      root.__threeOWheelAttached = true;
    }

    root.style.display = "";
  }



  // Подсветка карточки по изменению флага (и для NPC, и для PLAYER)
  function reflectActorFlag(actor) {
    if (!actor) return;
    const shown = !!foundry.utils.getProperty(actor, FLAG_PORTRAIT_SHOWN);
    for (const el of document.querySelectorAll(`#${DOCK_ID} .item[data-actor-id="${actor.id}"]`)) {
      el.classList.toggle("is-on", shown);
      el.title = makeTooltip(actor);
    }
    // keep mini-dock in sync (only when enabled)
    try { if (getShowActivePortraits()) buildMiniDock(); } catch(e) { /* ignore */ }
  }

  // Снять показ портретов у ВСЕХ актёров (NPC + PLAYER) по одному — надёжно
  async function hideAllPortraitsAllActors() {
    const actors = (game.actors?.contents ?? []).filter(a => a && (isNPC(a) || isPC(a)));
    for (const a of actors) {
      if (foundry.utils.getProperty(a, FLAG_PORTRAIT_SHOWN)) {
        try { await a.update({ [FLAG_PORTRAIT_SHOWN]: false }); } catch (e) { console.error(e); }
      }
    }
    if (globalThis.GinzzzuPortraits?.closeAllLocalPortraits) {
      GinzzzuPortraits.closeAllLocalPortraits();
    }
  }

  // дебаунс перестроения
  let rebuildTimer = null;
  function scheduleRebuild(delay = 60) { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(buildDock, delay); }

  // ── Hooks ────────────────────────────────────────────────────────────────────
  Hooks.once("ready", () => {
    if (!game.user?.isGM) 
      return;

    ensureDock();
    buildDock();

    // Listen for NPC dock layout setting changes
    Hooks.on("preUpdateSetting", (setting, data) => {
      if (setting.key === `${MODULE_ID}.npcDockWidth` || setting.key === `${MODULE_ID}.npcDockRows`) {
        setTimeout(() => {
          applyNpcDockLayout();
          scheduleRebuild(0);
        }, 50);
      }
    });

    // актёры
    Hooks.on("createActor", (a) => { scheduleRebuild(); });
    Hooks.on("deleteActor", (a) => { scheduleRebuild(); });
    Hooks.on("updateActor", (actor, diff) => {
      if (foundry.utils.hasProperty(diff, FLAG_PORTRAIT_SHOWN))
        reflectActorFlag(actor);

      const flat = foundry.utils.flattenObject(diff);
      const rel = ["name", "img", "type", "prototypeToken.texture.src", "folder"];
      if (rel.some(k => k in flat))
        scheduleRebuild();
      
      if (foundry.utils.hasProperty(diff, FLAG_MODULE)) 
        scheduleRebuild();
    });


    // папки
    Hooks.on("createFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });
    Hooks.on("updateFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });
    Hooks.on("deleteFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });

    // сцена
    Hooks.on("canvasReady", () => scheduleRebuild());

    // токены
    Hooks.on("createToken",  () => scheduleRebuild());
    // Hooks.on("updateToken",  () => scheduleRebuild());
    Hooks.on("deleteToken",  () => scheduleRebuild());
  });

   function selectMatching(sel, textToMtach) {
    const arr = Array.from(sel.options);
    const match = arr.findIndex(opt => opt.text === textToMtach);
    if (match > -1) {
      for (let idx = 0; idx < arr.length; idx++) {
        sel.options[idx].selected = (idx === match);
      }
      sel.dispatchEvent(new Event('change'), { bubbles: true});
    }
  }
  
  function setDashboard(options) {
    if (options) {
      if (options.folder) {
        selectMatching(folderEl, options.folder);
      }
      if (options.sort) {
        selectMatching(sortEl, options.sort);
      }
      if (options.search) {
        searchEl.value = options.search;
        searchEl.dispatchEvent(new Event('input'), { bubbles: true});
      }
    }
  }

  // Экспорт
  globalThis.GinzzzuNPCDock = {
    setDashboard,
    rebuild: buildDock,
    refreshDisplayNames: () => buildDock(),
    show: () => { const r = ensureDock(); r.style.display = ""; },
    hide: () => { const r = ensureDock(); r.style.display = "none"; }
  };
})();
