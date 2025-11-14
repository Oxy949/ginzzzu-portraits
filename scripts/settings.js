import { MODULE_ID } from "./core/constants.js";

// Settings for ginzzzu-portraits
Hooks.once("init", () => { 
  // Helper to register
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);

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
    requiresReload: false
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
    requiresReload: false
  });

  reg("portraitShadowDimStrength", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitShadowDimStrength.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.portraitShadowDimStrength.hint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.5,
    range: { min: 0, max: 1, step: 0.05 },
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
