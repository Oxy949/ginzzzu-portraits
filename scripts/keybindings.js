import { MODULE_ID } from "./core/constants.js";

export const PORTRAIT_KEYBINDINGS = Object.freeze({
  KEEP_DRAG_POSITION: "portraitDragKeepPosition",
  TRANSFORM_DRAG: "portraitDragTransformMode",
  ACTION_MODIFIER: "portraitActionModifier",
  PANEL_OPEN_SHEET_MODIFIER: "panelOpenSheetModifier"
});

const pressedCodes = new Set();

const MODIFIER_CODE_GROUPS = {
  SHIFT: ["ShiftLeft", "ShiftRight"],
  ALT: ["AltLeft", "AltRight"],
  CONTROL: ["ControlLeft", "ControlRight"],
  CTRL: ["ControlLeft", "ControlRight"],
  META: ["MetaLeft", "MetaRight"],
  COMMAND: ["MetaLeft", "MetaRight"],
  CMD: ["MetaLeft", "MetaRight"]
};

const CODE_EVENT_FLAGS = {
  ShiftLeft: "shiftKey",
  ShiftRight: "shiftKey",
  AltLeft: "altKey",
  AltRight: "altKey",
  ControlLeft: "ctrlKey",
  ControlRight: "ctrlKey",
  MetaLeft: "metaKey",
  MetaRight: "metaKey"
};

function localize(path) {
  try {
    return game.i18n.localize(`GINZZZUPORTRAITS.Keybindings.${path}`);
  } catch (e) {
    return path;
  }
}

function registerKeybinding(action, { name, hint, editable }) {
  try {
    game.keybindings.register(MODULE_ID, action, {
      name: localize(`${name}.name`),
      hint: localize(`${name}.hint`),
      editable,
      repeat: false,
      onDown: () => false,
      onUp: () => false
    });
  } catch (e) {
    console.warn(`[ginzzzu-portraits] Failed to register keybinding ${action}:`, e);
  }
}

function normalizeModifierName(modifier) {
  return String(modifier || "").trim().toUpperCase();
}

function isModifierActive(modifier, event = null) {
  const key = normalizeModifierName(modifier);
  const codes = MODIFIER_CODE_GROUPS[key] || [];
  if (codes.some(code => pressedCodes.has(code))) return true;

  if (!event) return false;
  if (key === "SHIFT") return !!event.shiftKey;
  if (key === "ALT") return !!event.altKey;
  if (key === "CONTROL" || key === "CTRL") return !!event.ctrlKey;
  if (key === "META" || key === "COMMAND" || key === "CMD") return !!event.metaKey;
  return false;
}

function isKeyCodeActive(code, event = null) {
  const key = String(code || "");
  if (!key) return false;
  if (pressedCodes.has(key)) return true;

  const eventFlag = CODE_EVENT_FLAGS[key];
  return !!eventFlag && !!event?.[eventFlag];
}

function bindingMatches(binding, event = null) {
  if (!binding?.key) return false;
  if (!isKeyCodeActive(binding.key, event)) return false;

  const modifiers = Array.isArray(binding.modifiers) ? binding.modifiers : [];
  return modifiers.every(modifier => isModifierActive(modifier, event));
}

function getBindings(action) {
  try {
    return game.keybindings?.get?.(MODULE_ID, action) || [];
  } catch (e) {
    return [];
  }
}

function trackKeyboardEvent(event, isDown) {
  const code = event?.code;
  if (!code) return;
  if (isDown) pressedCodes.add(code);
  else pressedCodes.delete(code);

  // If a modifier key is released outside the normal keyup path, keep state honest.
  if (!event.shiftKey) for (const code of MODIFIER_CODE_GROUPS.SHIFT) pressedCodes.delete(code);
  if (!event.altKey) for (const code of MODIFIER_CODE_GROUPS.ALT) pressedCodes.delete(code);
  if (!event.ctrlKey) for (const code of MODIFIER_CODE_GROUPS.CONTROL) pressedCodes.delete(code);
  if (!event.metaKey) for (const code of MODIFIER_CODE_GROUPS.META) pressedCodes.delete(code);
}

export function isPortraitControlKeyActive(action, event = null) {
  return getBindings(action).some(binding => bindingMatches(binding, event));
}

Hooks.once("init", () => {
  registerKeybinding(PORTRAIT_KEYBINDINGS.KEEP_DRAG_POSITION, {
    name: "keepDragPosition",
    editable: [{ key: "ShiftLeft" }, { key: "ShiftRight" }]
  });

  registerKeybinding(PORTRAIT_KEYBINDINGS.TRANSFORM_DRAG, {
    name: "transformDrag",
    editable: [{ key: "AltLeft" }, { key: "AltRight" }]
  });

  registerKeybinding(PORTRAIT_KEYBINDINGS.ACTION_MODIFIER, {
    name: "portraitActionModifier",
    editable: [
      { key: "ControlLeft" },
      { key: "ControlRight" },
      { key: "MetaLeft" },
      { key: "MetaRight" }
    ]
  });

  registerKeybinding(PORTRAIT_KEYBINDINGS.PANEL_OPEN_SHEET_MODIFIER, {
    name: "panelOpenSheetModifier",
    editable: [
      { key: "ControlLeft" },
      { key: "ControlRight" },
      { key: "MetaLeft" },
      { key: "MetaRight" }
    ]
  });
});

Hooks.once("ready", () => {
  window.addEventListener("keydown", event => trackKeyboardEvent(event, true), true);
  window.addEventListener("keyup", event => trackKeyboardEvent(event, false), true);
  window.addEventListener("blur", () => pressedCodes.clear());
});
