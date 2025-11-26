// Core constants shared across the module.
export const MODULE_ID = "ginzzzu-portraits";
export const DOCK_ID   = "ginzzzu-npc-dock";

// Commonly used flag keys
export const FLAG_MODULE            = `flags.${MODULE_ID}`;

export const FLAG_PORTRAIT_SHOWN    = `${FLAG_MODULE}.portraitShown`;
export const FLAG_DISPLAY_NAME      = `${FLAG_MODULE}.displayName`;
export const FLAG_FAVORITE          = `${FLAG_MODULE}.favorite`;
export const FLAG_PORTRAIT_EMOTION  = `${FLAG_MODULE}.portraitEmotion`;
export const FLAG_CUSTOM_EMOTIONS   = `${FLAG_MODULE}.customEmotions`;

// Animation and color intensity options for emotions
export const ANIMATION_TYPES = {
  none:   { key: "none",   label: "None",     value: "none" },
  shake:  { key: "shake",  label: "Shake",    value: "anger-jitter" },
  sag:    { key: "sag",    label: "Sag",      value: "sad-sag" },
  shiver: { key: "shiver", label: "Shiver",   value: "fear-shiver" },
  bob:    { key: "bob",    label: "Bob",      value: "joy-bob" },
  beat:   { key: "beat",   label: "Heartbeat", value: "heart-beat" },
  tired:  { key: "tired",  label: "Tired",    value: "tired-bob" },
  pulse:  { key: "pulse",  label: "Pulse",    value: "hurt-pulse" }
};

export const COLOR_INTENSITY_OPTIONS = [
  { key: "none",   label: "None",    value: 0 },
  { key: "low",    label: "Low",     value: 0.3 },
  { key: "medium", label: "Medium",  value: 0.6 },
  { key: "high",   label: "High",    value: 1 }
];