// Core constants shared across the module.
export const MODULE_ID = "ginzzzu-portraits";
export const DOCK_ID   = "ginzzzu-npc-dock";

// Commonly used flag keys
export const FLAG_MODULE                  = `flags.${MODULE_ID}`;

export const FLAG_PORTRAIT_SHOWN          = `${FLAG_MODULE}.portraitShown`;
export const FLAG_DISPLAY_NAME            = `${FLAG_MODULE}.displayName`;
export const FLAG_FAVORITE                = `${FLAG_MODULE}.favorite`;
export const FLAG_PORTRAIT_EMOTION        = `${FLAG_MODULE}.portraitEmotion`;
export const FLAG_CUSTOM_EMOTIONS         = `${FLAG_MODULE}.customEmotions`;
export const FLAG_SHOW_STANDARD_EMOTIONS  = `${FLAG_MODULE}.showStandardEmotions`;
export const FLAG_PORTRAIT_HEIGHT_MULTIPLIER = `${FLAG_MODULE}.portraitHeightMultiplier`;

// --------------------------------------------
// 1) СПИСОК ЦВЕТОВ (цветкоры)
// --------------------------------------------
// Тут задаются только ключ и CSS-класс для цветкора.
// В CSS ты прописываешь сами правила для .emo-*-color.
export const EMOTION_COLORS = {
  none:  { key: "none",  label: "None",  className: "" },

  joy:   { key: "joy",   label: "Joy",   className: "emo-joy-color" },
  anger: { key: "anger", label: "Anger", className: "emo-anger-color" },
  sad:   { key: "sad",   label: "Sad",   className: "emo-sad-color" },
  love:  { key: "love",  label: "Love",  className: "emo-love-color" },
  fear:  { key: "fear",  label: "Fear",  className: "emo-fear-color" },
  tired: { key: "tired", label: "Tired", className: "emo-tired-color" },
  hurt:  { key: "hurt",  label: "Hurt",  className: "emo-hurt-color" }

  // Хочешь новый цветкор — добавляешь ещё одну запись здесь
  // и создаёшь .emo-<key>-color в CSS.
};

// --------------------------------------------
// 2) СПИСОК ДВИЖЕНИЙ (анимации)
// --------------------------------------------
// key      — то, что хранится в данных (custom эмоции и т.п.)
// label    — подпись в выпадающих списках
// value    — имя @keyframes (или другое значение для --emotion-animation)
// className — CSS-класс движения (.emo-*-motion)
export const EMOTION_MOTIONS = {
  none:   { key: "none",   label: "None",      value: "none",         className: "" },

  shake:  { key: "shake",  label: "Shake",     value: "shake", className: "emo-shake-motion" },
  sag:    { key: "sag",    label: "Sag",       value: "sag",      className: "emo-sag-motion" },
  shiver: { key: "shiver", label: "Shiver",    value: "shiver",  className: "emo-shiver-motion" },
  bob:    { key: "bob",    label: "Bob",       value: "bob",      className: "emo-bob-motion" },
  beat:   { key: "beat",   label: "Heartbeat", value: "beat",   className: "emo-beat-motion" },
  tired:  { key: "tired",  label: "Tired",     value: "tired",    className: "emo-tired-motion" },
  pulse:  { key: "pulse",  label: "Pulse",     value: "pulse",   className: "emo-pulse-motion" }

  // Новое движение? Добавляешь сюда и делаешь .emo-<key>-motion в CSS,
  // плюс @keyframes с именем из value.
};

// --------------------------------------------
// 3) СПИСОК ЭМОЦИЙ (пресеты = цвет + движение)
// --------------------------------------------
// Всё, что знает UI про стандартные эмоции: ключ, подпись, эмодзи,
// и связка colorKey + motionKey.
export const EMOTIONS = {
  none: {
    key: "none",
    label: "None",
    emoji: "✖",
    colorKey: "none",
    motionKey: "none"
  },

  joy: {
    key: "joy",
    label: "Joy",
    emoji: "😊",
    colorKey: "joy",
    motionKey: "bob"
  },
  anger: {
    key: "anger",
    label: "Anger",
    emoji: "😠",
    colorKey: "anger",
    motionKey: "shake"
  },
  sad: {
    key: "sad",
    label: "Sad",
    emoji: "😢",
    colorKey: "sad",
    motionKey: "sag"
  },
  love: {
    key: "love",
    label: "Love",
    emoji: "💖",
    colorKey: "love",
    motionKey: "beat"
  },
  fear: {
    key: "fear",
    label: "Fear",
    emoji: "😱",
    colorKey: "fear",
    motionKey: "shiver"
  },
  tired: {
    key: "tired",
    label: "Tired",
    emoji: "😪",
    colorKey: "tired",
    motionKey: "tired"
  },
  hurt: {
    key: "hurt",
    label: "Hurt",
    emoji: "🤕",
    colorKey: "hurt",
    motionKey: "pulse"
  }

  // Новая эмоция? Добавляешь сюда запись с существующим colorKey и motionKey.
};