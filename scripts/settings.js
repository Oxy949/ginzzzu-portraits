import { MODULE_ID } from "./core/constants.js";

// Settings for ginzzzu-portraits
Hooks.once("init", () => { 
  // Helper to register
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);

  // === Appearance: layout and sizing ===
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

  reg("visualNovelMode", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.visualNovelMode.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.visualNovelMode.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

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

  // === Names: label appearance ===
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
    scope: "world",
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

  // === Tone: automatic brightness/contrast adjustments ===
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

  // === Access & UI panels ===
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

  reg("playerCharactersPanelEnabled", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.playerCharactersPanelEnabled.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.playerCharactersPanelEnabled.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("showActivePortraits", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.showActivePortraits.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.showActivePortraits.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  // === Emotion: panel and color effects ===
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

  // === Actors: image sources and type lists ===
  reg("actorImagePaths", {
    name: game.i18n.localize("GINZZZUPORTRAITS.Settings.actorImagePaths.name"),
    hint: game.i18n.localize("GINZZZUPORTRAITS.Settings.actorImagePaths.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "img, system.image, system.img, system.details.biography.portrait",
    requiresReload: true
  });

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

  // === Animation: timings and easing ===
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

  // === NPC Dock: preferences ===
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
