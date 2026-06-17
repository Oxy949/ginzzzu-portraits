import { MODULE_ID } from "./core/constants.js";

export const IGNORED_NPC_FOLDER_IDS_SETTING = "ignoredNpcFolderIds";

function getActorFolderPath(folder) {
  const names = [];
  let current = folder ?? null;
  while (current) {
    names.unshift(current.name || "");
    current = current.folder ?? null;
  }
  return names.join(" / ");
}

function getAllFoldersForSettings() {
  const folders = game.folders;
  if (!folders) return [];
  if (Array.isArray(folders)) return folders;
  if (Array.isArray(folders.contents)) return folders.contents;
  if (typeof folders.filter === "function") return folders.filter(() => true);
  if (typeof folders.values === "function") return Array.from(folders.values());
  return Array.from(folders);
}

function collectActorFoldersForIgnoredNPCSettings() {
  const allFolders = getAllFoldersForSettings();
  const actorFolders = allFolders.filter(folder =>
    String(folder?.type ?? folder?.documentName ?? "").toLowerCase() === "actor"
  );
  const foldersToShow = actorFolders.length ? actorFolders : allFolders;

  const folders = foldersToShow
    .filter(f => f?.id)
    .map(f => ({ id: f.id, label: getActorFolderPath(f) || f.name || f.id }));

  folders.sort((a, b) =>
    (a.label || "").localeCompare(b.label || "", game.i18n.lang || undefined, { sensitivity: "base" })
  );

  return folders;
}

function normalizeIgnoredFolderIds(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value instanceof Set) return Array.from(value).map(String).filter(Boolean);
  if (value && typeof value === "object") {
    return Object.values(value).map(String).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

let ignoredNPCFolderIdsCache = null;

export function invalidateIgnoredNPCFolderIdsCache() {
  ignoredNPCFolderIdsCache = null;
}

export function getIgnoredNPCFolderIds() {
  if (ignoredNPCFolderIdsCache) return ignoredNPCFolderIdsCache;
  try {
    ignoredNPCFolderIdsCache = new Set(normalizeIgnoredFolderIds(game.settings.get(MODULE_ID, IGNORED_NPC_FOLDER_IDS_SETTING)));
    return ignoredNPCFolderIdsCache;
  } catch {
    ignoredNPCFolderIdsCache = new Set();
    return ignoredNPCFolderIdsCache;
  }
}

export function isActorInIgnoredNPCFolder(actor) {
  const ignoredFolderIds = getIgnoredNPCFolderIds();
  if (!ignoredFolderIds.size) return false;

  let folder = actor?.folder ?? null;
  while (folder) {
    if (ignoredFolderIds.has(folder.id)) return true;
    folder = folder.folder ?? null;
  }
  return false;
}

function getIgnoredNPCFoldersConfigData(baseData = {}) {
  const ignoredFolderIds = getIgnoredNPCFolderIds();
  const folders = collectActorFoldersForIgnoredNPCSettings()
    .map(folder => ({
      ...folder,
      checked: ignoredFolderIds.has(folder.id)
    }));

  return {
    ...baseData,
    folders,
    hasFolders: folders.length > 0
  };
}

function getSelectedIgnoredNPCFolderIdsFromEntries(entries) {
  return entries
    .filter(([key, value]) => key.startsWith("folders.") && !!value)
    .map(([key]) => key.slice("folders.".length));
}

async function saveIgnoredNPCFolderIds(folderIds) {
  await game.settings.set(MODULE_ID, IGNORED_NPC_FOLDER_IDS_SETTING, folderIds);
  invalidateIgnoredNPCFolderIdsCache();
  globalThis.GinzzzuNPCDock?.rebuild?.();
}

const IgnoredNPCFoldersConfig = (() => {
  const ApplicationV2 = foundry.applications?.api?.ApplicationV2;
  const HandlebarsApplicationMixin = foundry.applications?.api?.HandlebarsApplicationMixin;

  if (ApplicationV2 && HandlebarsApplicationMixin) {
    return class IgnoredNPCFoldersConfigV2 extends HandlebarsApplicationMixin(ApplicationV2) {
      static DEFAULT_OPTIONS = {
        id: "ginzzzu-ignored-npc-folders-config",
        position: { width: 520 },
        window: {
          resizable: true
        }
      };

      static PARTS = {
        body: {
          template: `modules/${MODULE_ID}/templates/ignored-npc-folders.hbs`
        }
      };

      constructor(options = {}) {
        super(foundry.utils.mergeObject({
          window: {
            title: game.i18n.localize("GINZZZUPORTRAITS.Settings.ignoredNpcFolders.title")
          }
        }, options, { inplace: false }));
      }

      async _prepareContext(options) {
        return getIgnoredNPCFoldersConfigData(await super._prepareContext(options));
      }

      async _onRender(context, options) {
        await super._onRender(context, options);

        const form = this.element.querySelector("form");
        if (!form) return;

        form.querySelector("[data-action='select-all']")?.addEventListener("click", event => {
          event.preventDefault();
          form.querySelectorAll("input[type='checkbox'][name^='folders.']")
            .forEach(input => { input.checked = true; });
        });

        form.querySelector("[data-action='clear-all']")?.addEventListener("click", event => {
          event.preventDefault();
          form.querySelectorAll("input[type='checkbox'][name^='folders.']")
            .forEach(input => { input.checked = false; });
        });

        form.addEventListener("submit", async event => {
          event.preventDefault();
          const folderIds = getSelectedIgnoredNPCFolderIdsFromEntries(Array.from(new FormData(form).entries()));
          await saveIgnoredNPCFolderIds(folderIds);
          await this.close();
        });
      }
    };
  }

  return class IgnoredNPCFoldersConfigV1 extends FormApplication {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "ginzzzu-ignored-npc-folders-config",
        title: game.i18n.localize("GINZZZUPORTRAITS.Settings.ignoredNpcFolders.title"),
        template: `modules/${MODULE_ID}/templates/ignored-npc-folders.hbs`,
        width: 520,
        height: "auto",
        closeOnSubmit: true
      });
    }

    getData(options = {}) {
      return getIgnoredNPCFoldersConfigData(super.getData(options));
    }

    activateListeners(html) {
      super.activateListeners(html);

      html.find("[data-action='select-all']").on("click", event => {
        event.preventDefault();
        html.find("input[type='checkbox'][name^='folders.']").prop("checked", true);
      });

      html.find("[data-action='clear-all']").on("click", event => {
        event.preventDefault();
        html.find("input[type='checkbox'][name^='folders.']").prop("checked", false);
      });
    }

    async _updateObject(event, formData) {
      const folderEntries = (formData.folders && typeof formData.folders === "object")
        ? Object.entries(formData.folders).map(([key, value]) => [`folders.${key}`, value])
        : Object.entries(formData);

      await saveIgnoredNPCFolderIds(getSelectedIgnoredNPCFolderIdsFromEntries(folderEntries));
    }
  };
})();

const SETTINGS_GROUPS = [
  {
    id: "quick",
    keys: [
      "hidePortraits",
      "performanceMode"
    ]
  },
  {
    id: "npcDock",
    keys: [
      "playerCharactersPanelEnabled",
      "pcDockFolder",
      "showActivePortraits",
      "npcDockWidth",
      "npcDockRows",
      "npcDockFolder",
      "npcDockSearch",
      "npcDockSort",
      "showGroupActorsInSources",
      "ignoredNpcFoldersMenu"
    ]
  },
  {
    id: "portraitLayout",
    keys: [
      "visualNovelMode",
      "resizeToFit",
      "adjustForSidebar",
      "gmForcePortraitHeight",
      "gmPortraitHeight",
      "portraitHeight",
      "portraitBottomOffset",
      "portraitNamesAlwaysVisible",
      "portraitNameVertical",
      "portraitNameFontSize"
    ]
  },
  {
    id: "portraitVisuals",
    keys: [
      "portraitToneEnabled",
      "portraitToneStrength",
      "portraitFocusHighlightStrength",
      "portraitShadowDimStrength",
      "portraitBlurEnabled",
      "portraitBlurStrength",
      "portraitBlurSpeed",
      "portraitFocusBlurEnabled",
      "portraitFocusBlurStrength",
      "portraitFocusPortraitBlurEnabled",
      "portraitFocusPortraitBlurStrength",
      "portraitFadeMs",
      "portraitMoveMs",
      "portraitDragAnimate",
      "portraitDragResetOnRelease",
      "portraitDragMinScale",
      "portraitDragMaxScale",
      "portraitDragMinTiltDeg",
      "portraitDragMaxTiltDeg",
      "portraitEasing"
    ]
  },
  {
    id: "access",
    keys: [
      "portraitFlipAccess",
      "portraitDragAccess",
      "portraitUIToggleVisibility",
      "playerPortraitToolbarButton"
    ]
  },
  {
    id: "emotions",
    keys: [
      "emotionPanelVisibility",
      "emotionPanelScale",
      "emotionPanelPosition",
      "emotionColorIntensity",
      "emotionImageTransitionMs",
      "resetEmotionOnHide"
    ]
  },
  {
    id: "advanced",
    keys: [
      "actorImagePaths",
      "pcActorTypes",
      "npcActorTypes"
    ]
  }
];

function escapeAttributeValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getRenderedSettingsElement(app, htmlOrElement) {
  if (htmlOrElement?.jquery) return htmlOrElement[0];
  if (htmlOrElement instanceof HTMLElement) return htmlOrElement;
  if (app?.element?.jquery) return app.element[0];
  if (app?.element instanceof HTMLElement) return app.element;
  return null;
}

function getSettingOrMenuConfig(key) {
  const fullKey = `${MODULE_ID}.${key}`;
  return game.settings?.settings?.get(fullKey) ?? game.settings?.menus?.get(fullKey) ?? null;
}

function findSettingsRow(root, key) {
  const fullKey = `${MODULE_ID}.${key}`;
  const escapedFullKey = escapeAttributeValue(fullKey);
  const target = root.querySelector([
    `[name="${escapedFullKey}"]`,
    `[id="${escapedFullKey}"]`,
    `[data-key="${escapedFullKey}"]`,
    `[data-setting="${escapedFullKey}"]`,
    `[data-setting-key="${escapedFullKey}"]`,
    `[data-setting-id="${escapedFullKey}"]`
  ].join(","));

  if (target) return target.closest(".form-group, .form-group-stacked, li, .setting") ?? target.parentElement;

  const config = getSettingOrMenuConfig(key);
  const labels = [config?.name, config?.label].filter(Boolean).map(String);
  if (!labels.length) return null;

  for (const row of root.querySelectorAll(".form-group, .form-group-stacked, li, .setting")) {
    const text = row.textContent || "";
    if (labels.some(label => text.includes(label))) return row;
  }

  return null;
}

function makeSettingsGroupHeader(groupId) {
  const header = document.createElement("div");
  header.className = "ginzzzu-settings-heading";
  header.dataset.groupId = groupId;

  const title = document.createElement("h3");
  title.textContent = game.i18n.localize(`GINZZZUPORTRAITS.SettingsGroups.${groupId}.title`);
  header.appendChild(title);

  const hint = game.i18n.localize(`GINZZZUPORTRAITS.SettingsGroups.${groupId}.hint`);
  if (hint && !hint.startsWith("GINZZZUPORTRAITS.")) {
    const description = document.createElement("p");
    description.textContent = hint;
    header.appendChild(description);
  }

  return header;
}

function organizeModuleSettingsConfig(app, htmlOrElement) {
  const root = getRenderedSettingsElement(app, htmlOrElement);
  if (!root) return;

  const allRows = SETTINGS_GROUPS
    .flatMap(group => group.keys)
    .map(key => findSettingsRow(root, key))
    .filter(Boolean);
  if (!allRows.length) return;

  for (const header of root.querySelectorAll(".ginzzzu-settings-heading")) {
    header.remove();
  }

  for (const group of SETTINGS_GROUPS) {
    const rows = group.keys
      .map(key => findSettingsRow(root, key))
      .filter(Boolean);
    if (!rows.length) continue;

    const container = rows[0].parentElement;
    if (!container) continue;

    const header = makeSettingsGroupHeader(group.id);
    container.insertBefore(header, rows[0]);

    let marker = header;
    for (const row of rows) {
      if (row.parentElement !== container) continue;
      marker.after(row);
      marker = row;
    }
  }
}

function scheduleOrganizeModuleSettingsConfig(app, htmlOrElement) {
  window.setTimeout(() => organizeModuleSettingsConfig(app, htmlOrElement), 0);
}

// Settings for ginzzzu-portraits
Hooks.once("init", () => { 
  // Helper to register
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);

  // === Hide Portraits for Client (клиент / Client) ===
  reg("hidePortraits", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.hidePortraits.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.hidePortraits.hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  reg("performanceMode", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.performanceMode.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.performanceMode.hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  // === Player Dock: фильтр папок игроков (мир / World) ===
  const pcDockFolderChoices = {
    all: game.i18n.localize("GINZZZUPORTRAITS.pcFoldersAll"),
    "no-folder": game.i18n.localize("GINZZZUPORTRAITS.pcFoldersNoFolder")
  };

  reg("pcDockFolder", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.pcDockFolder.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.pcDockFolder.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: pcDockFolderChoices,
    default: "all",
    requiresReload: true
  });

  reg("gmForcePortraitHeight", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.gmForcePortraitHeight.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.gmForcePortraitHeight.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("gmPortraitHeight", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.gmPortraitHeight.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.gmPortraitHeight.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.8,
    range: { min: 0, max: 1, step: 0.01 },
    requiresReload: true
  });

  reg("portraitHeight", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitHeight.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitHeight.hint"),
    scope: "client",
    config: true,
    type: Number,
    default: 0.8,
    range: { min: 0, max: 1, step: 0.01 },
    requiresReload: true
  });

  // Saved order of portraits (per-client)
  reg("portraitSequence", {
    name: "Portrait Sequence",
    hint: "Internal: saved order of portraits in the HUD (not configurable)",
    scope: "client",
    config: false,
    type: Object,
    default: []
  });

  reg("portraitBottomOffset", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitBottomOffset.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitBottomOffset.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0,                    // отступ снизу в пикселях
    range: { min: 0, max: 800, step: 1 },
    requiresReload: true
  });

  reg("portraitNameVertical", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNameVertical.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNameVertical.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 50,              // по умолчанию середина
    range: { min: 0, max: 100, step: 1 },
    requiresReload: true
  });

  reg("portraitNameFontSize", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNameFontSize.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNameFontSize.hint"),
    scope: "client",
    config: true,
    type: Number,
    default: 25,
    range: { min: 10, max: 60, step: 1 },
    requiresReload: true
  });

  reg("portraitNamesAlwaysVisible", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNamesAlwaysVisible.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNamesAlwaysVisible.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      none:  game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNamesAlwaysVisible.option.none"),
      hover: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNamesAlwaysVisible.option.hover"),
      always: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitNamesAlwaysVisible.option.always")
    },
    default: "hover",
    requiresReload: true
  });

    // === Тон портретов в зависимости от темноты сцены (клиент / Client) ===
  reg("visualNovelMode", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.visualNovelMode.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.visualNovelMode.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  // === Тон портретов в зависимости от темноты сцены (клиент / Client) ===
  reg("resizeToFit", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.resizeToFit.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.resizeToFit.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("adjustForSidebar", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.adjustForSidebar.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.adjustForSidebar.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });
  
  reg("playerCharactersPanelEnabled", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.playerCharactersPanelEnabled.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.playerCharactersPanelEnabled.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

    // Show/hide active portrait mini-dock (client setting)
  reg("showActivePortraits", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.showActivePortraits.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.showActivePortraits.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("portraitToneEnabled", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitToneEnabled.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitToneEnabled.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("portraitToneStrength", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitToneStrength.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitToneStrength.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.6,
    range: { min: 0, max: 1, step: 0.05 },
    requiresReload: true
  });

    reg("portraitFocusHighlightStrength", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusHighlightStrength.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusHighlightStrength.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.5,
    range: { min: 0, max: 1, step: 0.05 },
    requiresReload: true
  });

  reg("portraitShadowDimStrength", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitShadowDimStrength.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitShadowDimStrength.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.5,
    range: { min: 0, max: 1, step: 0.05 },
    requiresReload: true
  });
  
    reg("portraitFlipAccess", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFlipAccess.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFlipAccess.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      gm:     game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFlipAccess.gm"),
      owners: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFlipAccess.owners")
    },
    default: "gm",
    requiresReload: true
  });

  reg("portraitDragAccess", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragAccess.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragAccess.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      all: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFlipAccess.owners"),
      gm: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFlipAccess.gm"),
      players: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragAccess.players"),
      none: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragAccess.none")
    },
    default: "all",
    requiresReload: false,
    onChange: () => globalThis.GinzzzuPortraits?.refreshDisplayNames?.()
  });

  // === Панель эмоций на портретах ===
  reg("emotionPanelVisibility", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelVisibility.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelVisibility.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      none: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelVisibility.none"),
      gm:   game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelVisibility.gm"),
      all:  game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelVisibility.all")
    },
    default: "gm",
    requiresReload: true
  });

  // Reset emotion when hiding portrait (world setting)
  reg("resetEmotionOnHide", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.resetEmotionOnHide.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.resetEmotionOnHide.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  // === Portrait UI Toggle Button Visibility ===
  reg("portraitUIToggleVisibility", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitUIToggleVisibility.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitUIToggleVisibility.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      all: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitUIToggleVisibility.all"),
      players: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitUIToggleVisibility.players"),
      gm: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitUIToggleVisibility.gm"),
      none: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitUIToggleVisibility.none")
    },
    default: "all",
    requiresReload: true
  });

  // Show player toolbar button near the portrait UI (world setting)
  reg("playerPortraitToolbarButton", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.playerPortraitToolbarButton.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.playerPortraitToolbarButton.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });
  reg("emotionPanelScale", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelScale.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelScale.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    range: { min: 0.6, max: 1.6, step: 0.05 },
    requiresReload: true
  });

  reg("emotionPanelPosition", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelPosition.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelPosition.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      top:   game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelPosition.top"),
      left:  game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelPosition.left"),
      right: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionPanelPosition.right")
    },
    default: "top",
    requiresReload: true
  });

  // === Интенсивность цветовых изменений от эмоций (клиент) ===
  reg("emotionColorIntensity", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionColorIntensity.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionColorIntensity.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    range: { min: 0, max: 1, step: 0.01 },
    requiresReload: false
  });

  // === Скорость анимации смены изображения при эмоциях (мс, клиент) ===
  reg("emotionImageTransitionMs", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionImageTransitionMs.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.emotionImageTransitionMs.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 320,
    range: { min: 0, max: 2000, step: 10 },
    requiresReload: false
  });


  // === Источник изображения актёра (CSV путей) ===
  reg("actorImagePaths", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.actorImagePaths.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.actorImagePaths.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "img, system.image, system.img, system.details.biography.portrait",
    requiresReload: true
  });

  // === Типы актёров (CSV) ===
  reg("pcActorTypes", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.pcActorTypes.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.pcActorTypes.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "character, pc, hero, player",
    requiresReload: true
  });

  reg("npcActorTypes", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcActorTypes.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcActorTypes.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "npc, adversary, creature, monster, minion",
    requiresReload: true
  });

  reg(IGNORED_NPC_FOLDER_IDS_SETTING, {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.ignoredNpcFolders.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.ignoredNpcFolders.hint"),
    scope: "world",
    config: false,
    type: Object,
    default: [],
    onChange: () => globalThis.GinzzzuNPCDock?.rebuild?.()
  });

  game.settings.registerMenu(MODULE_ID, "ignoredNpcFoldersMenu", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.ignoredNpcFolders.name"),
    label: game.i18n.localize("GINZZZUPORTRAITS.Settings.ignoredNpcFolders.open"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.ignoredNpcFolders.hint"),
    icon: "fas fa-folder-minus",
    type: IgnoredNPCFoldersConfig,
    restricted: true
  });

  // === Портреты: анимация (мир / World) ===
  reg("portraitFadeMs", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFadeMs.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFadeMs.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 300,
    range: { min: 0, max: 2000, step: 50 },
    requiresReload: true
  });

  reg("portraitMoveMs", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitMoveMs.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitMoveMs.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 450,
    range: { min: 0, max: 2000, step: 50 },
    requiresReload: true
  });

  reg("portraitDragAnimate", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragAnimate.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragAnimate.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });

  reg("portraitDragResetOnRelease", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragResetOnRelease.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragResetOnRelease.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });

  reg("portraitDragMinScale", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragMinScale.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragMinScale.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.55,
    range: { min: 0.1, max: 4, step: 0.05 },
    requiresReload: false
  });

  reg("portraitDragMaxScale", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragMaxScale.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragMaxScale.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1.85,
    range: { min: 0.1, max: 4, step: 0.05 },
    requiresReload: false
  });

  reg("portraitDragMinTiltDeg", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragMinTiltDeg.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragMinTiltDeg.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: -45,
    range: { min: -180, max: 0, step: 1 },
    requiresReload: false
  });

  reg("portraitDragMaxTiltDeg", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragMaxTiltDeg.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitDragMaxTiltDeg.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 45,
    range: { min: 0, max: 180, step: 1 },
    requiresReload: false
  });

  reg("portraitEasing", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitEasing.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitEasing.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "ease-out",
    requiresReload: true
  });

  // === Портреты: блюр фона (мир / World) ===
  reg("portraitBlurEnabled", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitBlurEnabled.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitBlurEnabled.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("portraitBlurStrength", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitBlurStrength.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitBlurStrength.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 2,
    range: { min: 1, max: 30, step: 1 },
    requiresReload: false
  });

  reg("portraitBlurSpeed", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitBlurSpeed.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitBlurSpeed.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1000,
    range: { min: 100, max: 2000, step: 50 },
    requiresReload: false
  });

  // === Портреты: блюр фокуса (мир / World) ===
  reg("portraitFocusBlurEnabled", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusBlurEnabled.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusBlurEnabled.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });

  reg("portraitFocusBlurStrength", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusBlurStrength.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusBlurStrength.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 4,
    range: { min: 1, max: 30, step: 1 },
    requiresReload: false
  });

  // === Портреты: блюр портретов вне фокуса (мир / World) ===
  reg("portraitFocusPortraitBlurEnabled", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusPortraitBlurEnabled.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusPortraitBlurEnabled.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false
  });

  reg("portraitFocusPortraitBlurStrength", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusPortraitBlurStrength.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFocusPortraitBlurStrength.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1,
    range: { min: 1, max: 30, step: 1 },
    requiresReload: false
  });

  // === NPC Dock: предпочтения (клиент / Client) ===
  reg("npcDockFolder", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockFolder.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockFolder.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "all",
    requiresReload: true
  });

  // Show group/party actors in the Source dropdown (world setting)
  reg("showGroupActorsInSources", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.showGroupActorsInSources.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.showGroupActorsInSources.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("npcDockSearch", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockSearch.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockSearch.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
    requiresReload: true
  });

  reg("npcDockSort", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockSort.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockSort.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      "name-asc": game.i18n.localize("GINZZZUPORTRAITS.sortByName"),
      "folder-asc": game.i18n.localize("GINZZZUPORTRAITS.sortByFolder")
    },
    default: "name-asc",
    requiresReload: true
  });

  reg("npcDockWidth", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockWidth.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockWidth.hint"),
    scope: "client",
    config: true,
    type: Number,
    default: 40,
    range: { min: 10, max: 100, step: 1 },
    requiresReload: true
  });

  reg("npcDockRows", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockRows.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.npcDockRows.hint"),
    scope: "client",
    config: true,
    type: Number,
    default: 1,
    range: { min: 1, max: 5, step: 1 },
    requiresReload: true
  });
});

// Вспомогательные функции для сбора папок с персонажами игроков
function parseCSVTypes(v) {
  return new Set(String(v ?? "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean));
}

function getPCTypesFromSettings() {
  try {
    return parseCSVTypes(game.settings.get(MODULE_ID, "pcActorTypes"));
  } catch {
    return parseCSVTypes("character, pc, hero, player");
  }
}

function collectPCFoldersForSettings() {
  const pcTypes = getPCTypesFromSettings();
  const actors = (game.actors?.contents ?? []).filter(a => {
    const t = String(a?.type ?? "").toLowerCase();
    return pcTypes.size ? pcTypes.has(t) : true;
  });

  const usedFolderIds = new Set();
  for (const a of actors) {
    let f = a.folder ?? null;
    while (f) {
      usedFolderIds.add(f.id);
      f = f.folder ?? null;
    }
  }

  const allFolders = (game.folders?.filter(f => f.type === "Actor") ?? []);
  const result = [];

  for (const f of allFolders) {
    if (!usedFolderIds.has(f.id)) continue;
    const names = [];
    let cur = f;
    while (cur) {
      names.unshift(cur.name || "");
      cur = cur.folder ?? null;
    }
    const path = names.join(" / ");
    result.push({ id: f.id, label: path || (f.name || f.id) });
  }

  result.sort((a, b) =>
    (a.label || "").localeCompare(b.label || "", game.i18n.lang || undefined, { sensitivity: "base" })
  );

  return result;
}

// После загрузки мира динамически дополняем choices для pcDockFolder папками с игроками
function applyPerformanceModeClass() {
  try {
    const enabled = !!game.settings.get(MODULE_ID, "performanceMode");
    document.body?.classList.toggle("ginzzzu-performance-mode", enabled);
  } catch (_) {}
}

Hooks.once("ready", () => {
  applyPerformanceModeClass();
  try {
    const settingKey = `${MODULE_ID}.pcDockFolder`;
    const setting = game.settings.settings.get(settingKey);
    if (!setting) return;

    // Базовые варианты
    const baseChoices = {
      all:       game.i18n.localize("GINZZZUPORTRAITS.pcFoldersAll"),
      "no-folder": game.i18n.localize("GINZZZUPORTRAITS.pcFoldersNoFolder")
    };

    // Папки, где реально есть PC-актёры (по pcActorTypes)
    const folders = collectPCFoldersForSettings();
    const folderChoices = {};
    for (const f of folders) {
      folderChoices[f.id] = f.label;
    }

    // Обновляем choices у самой настройки
    setting.choices = {
      ...baseChoices,
      ...folderChoices
    };
  } catch (e) {
    console.warn("[ginzzzu-portraits] pcDockFolder dynamic choices error:", e);
  }
});

Hooks.on("updateSetting", (setting) => {
  if (setting?.key === `${MODULE_ID}.${IGNORED_NPC_FOLDER_IDS_SETTING}`) {
    invalidateIgnoredNPCFolderIdsCache();
  }

  if (setting?.key === `${MODULE_ID}.performanceMode`) {
    applyPerformanceModeClass();
  }
});

Hooks.on("renderSettingsConfig", (app, html) => {
  scheduleOrganizeModuleSettingsConfig(app, html);
});

Hooks.on("renderApplicationV2", (app, element) => {
  const appId = app?.id ?? app?.options?.id ?? "";
  const appName = app?.constructor?.name ?? "";
  if (appId !== "settings-config" && appName !== "SettingsConfig") return;
  scheduleOrganizeModuleSettingsConfig(app, element);
});
