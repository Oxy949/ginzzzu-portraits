// systems/ginzzzu-threeO/scripts/threeO-npc-dock.js
(() => {
  const MODULE_ID = "ginzzzu-portraits"; const NS = "ginzzzu-portraits";
  const FLAG_KEY = `flags.${NS}.portraitShown`;
  const FLAG_FAV = `flags.${NS}.npcFavorite`;
  const DOCK_ID = "threeo-npc-dock";
  // ── Actor type utilities (configurable) ─────────────────────────────────────
  function parseCSVTypes(v) {
    return new Set(String(v ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
  }
  function getNPCTypes() {
    try { return parseCSVTypes(game.settings.get(NS, "npcActorTypes")); } catch { return parseCSVTypes("npc, adversary, creature, monster, minion"); }
  }
  function getPCTypes() {
    try { return parseCSVTypes(game.settings.get(NS, "pcActorTypes")); } catch { return parseCSVTypes("character, pc, hero, player"); }
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
    game.settings.register(NS, "npcDockSort",    { scope: "client", config: false, type: String, default: "name-asc" });
    game.settings.register(NS, "npcDockFolder",  { scope: "client", config: false, type: String, default: "all" });
    game.settings.register(NS, "npcDockSearch",  { scope: "client", config: false, type: String, default: "" });
  });

  Hooks.on("getActorContextOptions", async (app, menuItems) => {
    if (!game.user.isGM && game.settings.get(CONSTANTS.MODULE_ID, "gmOnly")) {
      return;
    }
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

  const getSortMode   = () => { try { return game.settings.get(NS, "npcDockSort")   || "name-asc"; } catch { return "name-asc"; } };
  const setSortMode   = (v) => { try { game.settings.set(NS, "npcDockSort",   v); } catch {} };
  const getFolderSel  = () => { try { return game.settings.get(NS, "npcDockFolder") || "all"; } catch { return "all"; } };
  const setFolderSel  = (v) => { try { game.settings.set(NS, "npcDockFolder", v); } catch {} };
  const getSearchText = () => { try { return game.settings.get(NS, "npcDockSearch") || ""; } catch { return ""; } };
  const setSearchText = (v) => { try { game.settings.set(NS, "npcDockSearch", v); } catch {} };

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

    // CSS
    if (!document.getElementById(`${DOCK_ID}-style`)) {
      const css = document.createElement("style");
      css.id = `${DOCK_ID}-style`;
      css.textContent = `
#${DOCK_ID} {
  position: fixed;
  left: 50%; transform: translateX(-50%);
  bottom: 80px;                 /* по ТЗ */
  width: 40vw;                  /* по ТЗ */
  z-index: 40;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(12, 8, 16, 0.35);
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  backdrop-filter: blur(2px);
}
#${DOCK_ID} .toolbar {
  display:flex; align-items:center; gap:10px; justify-content:space-between;
  margin-bottom:6px; opacity:.95; font-size:12px; color:#ddd;
}
#${DOCK_ID} .toolbar .left { display:flex; align-items:center; gap:8px; flex:1 1 auto; min-width:0; }
#${DOCK_ID} .toolbar input[type="text"] {
  flex:1 1 220px; min-width:140px; max-width:32vw;
  background: rgba(0,0,0,0.35);
  color:#eee; border:1px solid rgba(255,255,255,0.15);
  border-radius:6px; padding:4px 8px; font-size:12px;
}
#${DOCK_ID} .toolbar .right { display:flex; align-items:center; gap:8px; flex:0 0 auto; white-space:nowrap; flex-wrap:nowrap; }
#${DOCK_ID} .toolbar label { opacity:.8; white-space:nowrap; }
#${DOCK_ID} .toolbar select {
  display:inline-block; width:auto; max-width:18vw;
  background: rgba(0,0,0,0.35);
  color:#eee; border:1px solid rgba(255,255,255,0.15);
  border-radius:6px; padding:2px 6px; font-size:12px;
}
#${DOCK_ID} .toolbar button.clear-all {
  display:inline-flex; align-items:center; justify-content:center;
  background:#742f2f; color:#fff; border:none; border-radius:6px;
  padding:3px 8px; cursor:pointer; flex:0 0 auto;
}

/* Контент: слева players (до 25%), справа NPC-линия */
#${DOCK_ID} .content { display:flex; align-items:flex-start; gap:10px; }

/* Левая колонка: грид игроков, фикс. ячейки 50x50, без скролла */
#${DOCK_ID} .players {
  flex: 0 0 180px;                   /* фиксированная ширина, не сжимается */
  width: 160px;                      /* ~3 колонки по 50px + зазоры */
  display: grid;
  grid-template-columns: repeat(3, 1fr); /* ровно 3 столбца */
  grid-auto-rows: 1fr;
  gap: 6px;
  align-content: start;
  justify-items: stretch;
  max-height: calc(50px * 2 + 6px);  /* 2 ряда по 50px + зазор */
  overflow-y: auto;                  /* вертикальный скролл */
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: rgba(200,200,255,0.4) rgba(0,0,0,0.2);
}

/* Правая колонка: NPC-лента как раньше, со скроллом колёсиком */
#${DOCK_ID} .npcs { flex:1 1 auto; overflow:hidden; }
#${DOCK_ID} .npcs .rail { display:flex; flex-direction:row; align-items:center; gap:8px; overflow:hidden; }

/* Карточки базовые */
#${DOCK_ID} .item {
  flex: 0 0 auto;
  width: 100px; height: 100px;
  border-radius: 10px; overflow: hidden; position: relative; cursor: pointer;
  border: 2px solid var(--folder-color, rgba(255,255,255,0.12));
  background: var(--folder-bg, #281d3a);
  box-shadow: var(--folder-shadow, 0 6px 16px rgba(0,0,0,0.45));
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}
#${DOCK_ID} .item:hover { transform: translateY(-2px); box-shadow: 0 10px 10px rgba(0,0,0,0.55); transform: scale(0.98);}
#${DOCK_ID} .item img { width:100%; height:100%; object-fit:cover; display:block; user-select:none; -webkit-user-drag:none; }

/* Уменьшенные карточки для игроков */
#${DOCK_ID} .players .item { width:50px; height:50px; border-radius:8px; }

/* Активная подсветка (общая) */
#${DOCK_ID} .item.is-on {
  border-color: #cfa3ff;
  box-shadow:
    0 0 0 2px rgba(207,163,255,0.65),
    0 0 18px rgba(155,108,255,0.45),
    0 10px 22px rgba(0,0,0,0.55);
  transform: translateY(-1px);
}
#${DOCK_ID} .item.is-on::after {
  content: ""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  box-shadow: 0 0 12px 2px rgba(200,150,255,0.6);
  animation: threeoPulse 2.4s ease-in-out infinite alternate;
}
@keyframes threeoPulse { from { opacity:.6; } to { opacity:.05; }

/* Избранные */
#${DOCK_ID} .item.is-fav { border-color: #ffd76a; }
#${DOCK_ID} .item .fav-star{
  position:absolute; left:4px; top:4px;
  width:18px; height:18px; border-radius:50%;
  background: rgba(0,0,0,.55);
  border:1px solid rgba(255,255,255,.35);
  display:grid; place-items:center;
  font-size:12px; color:#ffd76a;
  text-shadow:0 1px 1px rgba(0,0,0,.5);
  pointer-events:none;
}

#${DOCK_ID} .empty { color:#ccc; opacity:.7; font-size:12px; text-align:center; padding:8px 0; }
`;
      document.head.appendChild(css);
    }

    // Корень
    root = document.createElement("div");
    root.id = DOCK_ID;
    root.style.display = "none";
    document.body.appendChild(root);

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.innerHTML = `
      <div class="left">
        <input id="threeo-npc-search" type="text" placeholder="Поиск NPC...">
      </div>
      <div class="right">
        <label>Сортировка:</label>
        <select id="threeo-npc-sort">
          <option value="name-asc">по имени</option>
          <option value="folder-asc">по папке</option>
        </select>
        <label>Папка:</label>
        <select id="threeo-npc-folder">
          <option value="all">(все папки)</option>
        </select>
        <button class="clear-all" id="threeo-npc-clear" title="Скрыть все портреты">🧹</button>
      </div>
    `;
    root.appendChild(toolbar);

    // Контент: players + npcs
    const content = document.createElement("div");
    content.className = "content";
    content.innerHTML = `
      <div class="players"></div>
      <div class="npcs"><div class="rail"></div></div>
    `;
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
    const searchEl = toolbar.querySelector("#threeo-npc-search");
    const sortEl   = toolbar.querySelector("#threeo-npc-sort");
    const folderEl = toolbar.querySelector("#threeo-npc-folder");
    const clearBtn = toolbar.querySelector("#threeo-npc-clear");

    searchEl.value = getSearchText();
    sortEl.value   = getSortMode();

    searchEl.addEventListener("input", (e) => { setSearchText(e.target.value || ""); scheduleRebuild(0); });
    sortEl.addEventListener("change", (e) => { setSortMode(e.target.value); scheduleRebuild(0); });
    folderEl.addEventListener("change", (e) => { setFolderSel(e.target.value || "all"); scheduleRebuild(0); });

    clearBtn.addEventListener("click", async (e) => { e.preventDefault(); await hideAllPortraitsAllActors(); });

    return root;
  }

  // Обновить список опций папок
  function refreshFolderSelectOptions() {
    const root = ensureDock();
    const sel = root.querySelector("#threeo-npc-folder");
    if (!sel) return;
    const current = getFolderSel();
    sel.innerHTML = `<option value="all">(все папки)</option>`;
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
    const isShown = !!foundry.utils.getProperty(actor, FLAG_KEY);
    try { await actor.update({ [FLAG_KEY]: !isShown }); }
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
    const isFav = !!foundry.utils.getProperty(actor, FLAG_FAV);
    try {
      await actor.update({ [FLAG_FAV]: !isFav });
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
      const aFav = !!foundry.utils.getProperty(a, `flags.${NS}.pcFavorite`);
      const bFav = !!foundry.utils.getProperty(b, `flags.${NS}.pcFavorite`);
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
      const FLAG_FAV_PC = `flags.${NS}.pcFavorite`;

      const img = document.createElement("img");
      img.src = a.img || a.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg";
      img.alt = a.name || "Player";
      btn.appendChild(img);

      const shown = !!foundry.utils.getProperty(a, FLAG_KEY);
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
        const isFav = !!foundry.utils.getProperty(a, `flags.${NS}.pcFavorite`);
        try { await a.update({ [`flags.${NS}.pcFavorite`]: !isFav }); scheduleRebuild(0); } catch (e) { console.error(e); }
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
    if (folderSel !== "all") {
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
      containerRail.innerHTML = `<div class="empty">Нет NPC по текущим фильтрам</div>`;
      return;
    }

    // сортировка с учетом избранного
    const mode = getSortMode();
    npcs.sort((a, b) => {
      // сначала по избранному
      const aFav = !!foundry.utils.getProperty(a, FLAG_FAV);
      const bFav = !!foundry.utils.getProperty(b, FLAG_FAV);
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

      const shown = !!foundry.utils.getProperty(a, FLAG_KEY);
      if (shown) btn.classList.add("is-on");

      // NPC favorite visual
      if (foundry.utils.getProperty(a, FLAG_FAV)) {
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

    buildPlayers(playersBox);
    buildNPCs(npcRail);

    root.style.display = "";
  }

  // Подсветка карточки по изменению флага (и для NPC, и для PLAYER)
  function reflectActorFlag(actor) {
    if (!actor) return;
    const shown = !!foundry.utils.getProperty(actor, FLAG_KEY);
    for (const el of document.querySelectorAll(`#${DOCK_ID} .item[data-actor-id="${actor.id}"]`)) {
      el.classList.toggle("is-on", shown);
      el.title = makeTooltip(actor);
    }
  }

  // Снять показ портретов у ВСЕХ актёров (NPC + PLAYER) по одному — надёжно
  async function hideAllPortraitsAllActors() {
    const actors = (game.actors?.contents ?? []).filter(a => a && (isNPC(a) || isPC(a)));
    for (const a of actors) {
      if (foundry.utils.getProperty(a, FLAG_KEY)) {
        try { await a.update({ [FLAG_KEY]: false }); } catch (e) { console.error(e); }
      }
    }
    if (globalThis.ThreeOPortraits?.closeAllLocalPortraits) {
      ThreeOPortraits.closeAllLocalPortraits();
    }
  }

  // дебаунс перестроения
  let rebuildTimer = null;
  function scheduleRebuild(delay = 60) { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(buildDock, delay); }

  // ── Hooks ────────────────────────────────────────────────────────────────────
  Hooks.once("ready", () => {
    if (!game.user?.isGM) return;
    ensureDock();
    buildDock();

    // актёры
    Hooks.on("createActor", (a) => { if (a?.type === "npc" || a?.type === "player") scheduleRebuild(); });
    Hooks.on("deleteActor", (a) => { if (a?.type === "npc" || a?.type === "player") scheduleRebuild(); });
    Hooks.on("updateActor", (actor, diff) => {
      if (foundry.utils.hasProperty(diff, FLAG_KEY)) reflectActorFlag(actor);
      const flat = foundry.utils.flattenObject(diff);
      const rel = ["name", "img", "type", "prototypeToken.texture.src", "folder"];
      if (rel.some(k => k in flat)) scheduleRebuild();
      // rebuild if favorite flags changed (npc or pc)
      if (foundry.utils.hasProperty(diff, FLAG_FAV)) scheduleRebuild();
      if (foundry.utils.hasProperty(diff, `flags.${NS}.pcFavorite`)) scheduleRebuild();
    });

    // папки
    Hooks.on("createFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });
    Hooks.on("updateFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });
    Hooks.on("deleteFolder", (f) => { if (f?.type === "Actor") scheduleRebuild(); });

    Hooks.on("canvasReady", () => scheduleRebuild());
  });

  // Экспорт
  globalThis.ThreeONPCDock = {
    rebuild: buildDock,
    show: () => { const r = ensureDock(); r.style.display = ""; },
    hide: () => { const r = ensureDock(); r.style.display = "none"; }
  };
})();
