import { MODULE_ID } from "./core/constants.js";

// Settings for ginzzzu-portraits
Hooks.once("init", () => { 
  // Helper to register
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);

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
    type: Boolean,
    default: false,
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

  // === Портреты: анимация (мир / World) ===
  reg("portraitFadeMs", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFadeMs.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitFadeMs.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 300,
    requiresReload: true
  });

  reg("portraitMoveMs", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitMoveMs.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitMoveMs.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 450,
    requiresReload: true
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
    default: "name-asc",
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
Hooks.once("ready", () => {
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
