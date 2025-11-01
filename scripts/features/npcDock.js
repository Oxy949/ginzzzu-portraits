import { MODULE_ID, DOCK_ID, FLAG_PORTRAIT_SHOWN, FLAG_FAVORITE } from "../core/constants.js";

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

  Hooks.on("getActorContextOptions", async (app, menuItems) => {
    return;
    // const getActorData = /* @__PURE__ */ __name((target) => {
    //   return game.actors.get($(target).data("entry-id"));
    // }, "getActorData");
    // menuItems.splice(
    //   3,
    //   0,
    //   {
    //     name: "Theatre.UI.Config.AddToStage",
    //     condition: /* @__PURE__ */ __name((target) => !Theatre.isActorStaged(getActorData(target)), "condition"),
    //     icon: '<i class="fas fa-theater-masks"></i>',
    //     callback: /* @__PURE__ */ __name((target) => Theatre.addToNavBar(getActorData(target)), "callback")
    //   },
    //   {
    //     name: "Theatre.UI.Config.RemoveFromStage",
    //     condition: /* @__PURE__ */ __name((target) => Theatre.isActorStaged(getActorData(target)), "condition"),
    //     icon: '<i class="fas fa-theater-masks"></i>',
    //     callback: /* @__PURE__ */ __name((target) => Theatre.removeFromNavBar(getActorData(target)), "callback")
    //   }
    // );
  });

  const getSortMode   = () => { try { return game.settings.get(MODULE_ID, "npcDockSort")   || "name-asc"; } catch { return "name-asc"; } };
  const setSortMode   = (v) => { try { game.settings.set(MODULE_ID, "npcDockSort",   v); } catch {} };
  const getFolderSel  = () => { try { return game.settings.get(MODULE_ID, "npcDockFolder") || "all"; } catch { return "all"; } };
  const setFolderSel  = (v) => { try { game.settings.set(MODULE_ID, "npcDockFolder", v); } catch {} };
  const getSearchText = () => { try { return game.settings.get(MODULE_ID, "npcDockSearch") || ""; } catch { return ""; } };
  const setSearchText = (v) => { try { game.settings.set(MODULE_ID, "npcDockSearch", v); } catch {} };
  const getIsCollapsed = () => { try { return game.settings.get(MODULE_ID, "npcDockCollapsed"); } catch { return false; } };
  const setIsCollapsed = (v) => { try { game.settings.set(MODULE_ID, "npcDockCollapsed", v); } catch {} };

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
    const folderPath = getFolderPath(actor);
    return folderPath ? `${actor.name}\n${folderPath}` : actor.name;
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
        <button class="collapse-btn" id="ginzzzu-npc-collapse" title="${isCollapsed ? 'Развернуть' : 'Свернуть'}">
          <i class="fas ${isCollapsed ? 'fa-expand' : 'fa-compress'}"></i>
        </button>
      </div>
    `;
    root.appendChild(toolbar);

    // Контент: players + npcs
    const content = document.createElement("div");
    content.className = "content";
    
    if (game.settings.get(MODULE_ID, "playerCharactersPanelEnabled") ) {
    content.innerHTML = `
      <div class="players"></div>
      <div class="npcs"><div class="rail"></div></div>
    `;
    } else {
      content.innerHTML = `
        <div class="players" style="display: none; visibility: hidden;"></div>
        <div class="npcs"><div class="rail"></div></div>
      `;
    }
    root.appendChild(content);

    // Прокрутка колёсиком — скроллим только NPC-ленту
    // wheel: если над блоком игроков — крутим ВЕРТИКАЛЬНО players,
    // иначе крутим ГОРИЗОНТАЛЬНО рельсу NPC
    root.addEventListener("wheel", (ev) => {
      const players = root.querySelector(".players");
      const npcsRail = root.querySelector(".npcs .rail");
      if (!players || !npcsRail) return;

      const pRect = players.getBoundingClientRect();
      const overPlayers =
        ev.clientX >= pRect.left && ev.clientX <= pRect.right &&
        ev.clientY >= pRect.top  && ev.clientY <= pRect.bottom;

      if (overPlayers) {
        // вертикальная прокрутка сетки игроков
        ev.preventDefault();
        players.scrollTop += ev.deltaY;
      } else {
        // горизонтальная прокрутка NPC-рельсы
        if (!ev.deltaY) return;
        ev.preventDefault();
        npcsRail.scrollLeft += ev.deltaY;
      }
    }, { passive: false });

    // Контекстное меню карточек отключаем (ПКМ — открыть лист)
    root.addEventListener("contextmenu", (ev) => {
      if ((ev.target instanceof HTMLElement) && ev.target.closest(`#${DOCK_ID} .item`)) {
        ev.preventDefault();
      }
    });

    // Контролы
    const searchEl = toolbar.querySelector("#ginzzzu-npc-search");
    const sortEl   = toolbar.querySelector("#ginzzzu-npc-sort");
    const folderEl = toolbar.querySelector("#ginzzzu-npc-folder");
    const clearBtn = toolbar.querySelector("#ginzzzu-npc-clear");

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
      collapseBtn.title = isCollapsed ? "Развернуть" : "Свернуть";
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

    sel.value = current;
    if (sel.value !== current) { sel.value = "all"; setFolderSel("all"); }
  }

  // Клик по карточке: toggle флага (общая для NPC/PLAYER)
  async function onCardClickToggle(ev) {
    ev.preventDefault();
    const btn = ev.currentTarget;
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
      await actor.update({ [FLAG_FAVORITE]: !isFav });
      scheduleRebuild(0);
    } catch (e) {
      console.error("[threeO-dock] fav toggle error:", e);
    }
  }

  // Построить карточки players (type "player")
  function buildPlayers(container) {
    container.innerHTML = "";
    const pcs = (game.actors?.contents ?? []).filter(a => isPC(a));
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
        try { await a.update({ [`flags.${MODULE_ID}.pcFavorite`]: !isFav }); scheduleRebuild(0); } catch (e) { console.error(e); }
      });

      container.appendChild(btn);
    }
  }

  // Построить карточки NPC (с учётом фильтров)
  function buildNPCs(containerRail) {
    containerRail.innerHTML = "";

    let npcs = (game.actors?.contents ?? []).filter(a => isNPC(a));

    // фильтр по папке
    const folderSel = getFolderSel();
    
    if (folderSel === "from-scene") {
      // показать только тех NPC, чьи токены есть на текущей сцене
      const tokens = canvas?.tokens?.placeables ?? [];
      const actorIdsOnScene = new Set(
        tokens.map(t => t?.actor?.id || t?.document?.actorId || t?.actorId).filter(Boolean)
      );
      npcs = npcs.filter(a => actorIdsOnScene.has(a.id));
    } else if (folderSel !== "all") {
      // стандартный фильтр по выбранной папке
      npcs = npcs.filter(a => {
        let f = a.folder ?? null;
        while (f) { if (f.id === folderSel) return true; f = f.folder ?? null; }
        return false;
      });
    }

    // фильтр по поиску (имя/путь)
    const q = (getSearchText() || "").trim().toLowerCase();
    if (q) {
      npcs = npcs.filter(a => {
        const name = (a.name || "").toLowerCase();
        const path = (getFolderPath(a) || "").toLowerCase();
        return name.includes(q) || path.includes(q);
      });
    }

    if (!npcs.length) {
      containerRail.innerHTML = `<div class="empty">${game.i18n.localize("GINZZZUPORTRAITS.noNPCFound")}</div>`;
      return;
    }

    // сортировка с учетом избранного
    const mode = getSortMode();
    npcs.sort((a, b) => {
      // сначала по избранному
      const aFav = !!foundry.utils.getProperty(a, FLAG_FAVORITE);
      const bFav = !!foundry.utils.getProperty(b, FLAG_FAVORITE);
      if (aFav !== bFav) return bFav ? 1 : -1;

      // затем по выбранному режиму
      if (mode === "folder-asc") {
        const pa = getFolderPath(a), pb = getFolderPath(b);
        const byFolder = (pa||"").localeCompare(pb||"", game.i18n.lang || undefined, { sensitivity:"base" });
        if (byFolder !== 0) return byFolder;
      }
      return (a.name||"").localeCompare(b.name||"", game.i18n.lang || undefined, { sensitivity:"base" });
    });

    for (const a of npcs) {
      const btn = document.createElement("div");
      btn.className = "item";
      btn.dataset.actorId = a.id;
      btn.title = makeTooltip(a);

      const img = document.createElement("img");
      img.src = a.img || a.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";
      img.alt = a.name || "NPC";
      btn.appendChild(img);

      const shown = !!foundry.utils.getProperty(a, FLAG_PORTRAIT_SHOWN);
      if (shown) btn.classList.add("is-on");

      // NPC favorite visual
      if (foundry.utils.getProperty(a, FLAG_FAVORITE)) {
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
      btn.addEventListener("mouseup", onCardRightMouse);
      // middle click toggle favorite
      btn.addEventListener("mousedown", onCardMiddleFav);

      containerRail.appendChild(btn);
    }
  }

  // Построение всего дока
  function buildDock() {
    if (!game.user?.isGM) return;
    const root = ensureDock();

    // обновление селектора папок
    refreshFolderSelectOptions();

    // players + npcs
    const playersBox = root.querySelector(".players");
    const npcRail    = root.querySelector(".npcs .rail");

    if (game.settings.get(MODULE_ID, "playerCharactersPanelEnabled") ) {
      buildPlayers(playersBox);
    }
    buildNPCs(npcRail);

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
      // rebuild if favorite flags changed (npc or pc)
      if (foundry.utils.hasProperty(diff, FLAG_FAVORITE)) scheduleRebuild();
      if (foundry.utils.hasProperty(diff, `flags.${MODULE_ID}.pcFavorite`)) scheduleRebuild();
    });

    // папки
    Hooks.on("createFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });
    Hooks.on("updateFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });
    Hooks.on("deleteFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });

    // сцена
    Hooks.on("canvasReady", () => scheduleRebuild());

    // токены
    Hooks.on("createToken",  () => scheduleRebuild());
    Hooks.on("updateToken",  () => scheduleRebuild());
    Hooks.on("deleteToken",  () => scheduleRebuild());
  });

  // Экспорт
  globalThis.GinzzzuNPCDock = {
    rebuild: buildDock,
    show: () => { const r = ensureDock(); r.style.display = ""; },
    hide: () => { const r = ensureDock(); r.style.display = "none"; }
  };
})();
