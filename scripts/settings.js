// Settings for ginzzzu-portraits
Hooks.once("init", () => {
  const MOD = "ginzzzu-portraits";

  // Helper to register
  const reg = (key, data) => game.settings.register(MOD, key, data);

  reg("gmForcePortraitHeight", {
    name: "Перезаписывать высоту портретов у игроков",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("gmPortraitHeight", {
    name: "[мир] Портреты: высота",
    hint: "0 — полоска снизу, 1 — полная высота",
    scope: "world",
    config: true,
    type: Number,
    default: 0.8,
    range: { min: 0, max: 1, step: 0.01 },
    requiresReload: true
  });

  reg("portraitHeight", {
    name: "Портреты: высота",
    hint: "0 — полоска снизу, 1 — полная высота. Если GM не задал принудительно, то используется это значение.",
    scope: "client",
    config: true,
    type: Number,
    default: 0.8,
    range: { min: 0, max: 1, step: 0.01 },
    requiresReload: true
  });

    // === Тон портретов в зависимости от темноты сцены (клиент / Client) ===
  reg("visualNovelMode", {
    name: "Режим новеллы",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  // === Тон портретов в зависимости от темноты сцены (клиент / Client) ===
  reg("resizeToFit", {
    name: "Портреты: уменьшать размер, чтобы влезли все портреты",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("adjustForSidebar", {
    name: "Портреты: учитывать ширину боковой панели",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });
  
  reg("portraitToneEnabled", {
    name: "Портреты: подстраивать яркость/контраст под темноту сцены",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  reg("portraitToneStrength", {
    name: "Портреты: сила подстройки (0..1)",
    hint: "0 — без изменений, 1 — максимально заметная коррекция",
    scope: "world",
    config: true,
    type: Number,
    default: 0.6,
    range: { min: 0, max: 1, step: 0.05 },
    requiresReload: true
  });

  // === Источник изображения актёра (CSV путей) ===
  reg("actorImagePaths", {
    name: "Пути к изображению актёра (CSV)",
    hint: "Список dot-path полей Actor через запятую, которые по порядку используются как источник изображения. Например: img, prototypeToken.texture.src, system.image",
    scope: "world",
    config: true,
    type: String,
    default: "img, system.image, system.img, system.details.biography.portrait",
    requiresReload: true
  });

  // === Типы актёров (CSV) ===
  reg("pcActorTypes", {
    name: "Типы актёров: Игроки (CSV)",
    hint: "Список типов Actor через запятую, которые считать «игроками». Примеры: character, pc, hero, player",
    scope: "world",
    config: true,
    type: String,
    default: "character, pc, hero, player",
    requiresReload: true
  });

  reg("npcActorTypes", {
    name: "Типы актёров: NPC (CSV)",
    hint: "Список типов Actor через запятую, которые считать NPC. Примеры: npc, adversary, creature, monster, minion",
    scope: "world",
    config: true,
    type: String,
    default: "npc, adversary, creature, monster, minion",
    requiresReload: true
  });

  // === Портреты: анимация (мир / World) ===
  reg("portraitFadeMs", {
    name: "Портреты: длительность появления (мс)",
    hint: "Сколько миллисекунд длится плавное появление портрета.",
    scope: "world",
    config: true,
    type: Number,
    default: 300,
    requiresReload: true
  });

  reg("portraitMoveMs", {
    name: "Портреты: длительность движения (мс)",
    hint: "Сколько миллисекунд длится сдвиг/движение портрета.",
    scope: "world",
    config: true,
    type: Number,
    default: 450,
    requiresReload: true
  });

  reg("portraitEasing", {
    name: "Портреты: тип easing",
    hint: "CSS timing-function: например, 'ease', 'ease-out', 'ease-in-out' или cubic-bezier(0.22,1,0.36,1).",
    scope: "world",
    config: true,
    type: String,
    default: "ease-out",
    requiresReload: true
  });

  // === NPC Dock: предпочтения (клиент / Client) ===
  reg("npcDockFolder", {
    name: "NPC Dock: фильтр папки по умолчанию",
    hint: "Например: 'all'. Может переопределяться самим доком во время работы.",
    scope: "world",
    config: true,
    type: String,
    default: "all",
    requiresReload: true
  });

  reg("npcDockSearch", {
    name: "NPC Dock: поисковая строка по умолчанию",
    scope: "world",
    config: true,
    type: String,
    default: "",
    requiresReload: true
  });

  reg("npcDockSort", {
    name: "NPC Dock: сортировка по умолчанию",
    hint: "Например: 'name-asc' или 'name-desc'.",
    scope: "world",
    config: true,
    type: String,
    default: "name-asc",
    requiresReload: true
  });
});
