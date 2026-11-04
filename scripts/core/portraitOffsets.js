import { MODULE_ID } from "./constants.js";

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizePortraitOffsetPercent(value) {
  return Math.max(-100, Math.min(100, finiteNumber(value)));
}

// The rail already applies the global offset. Shift only this actor by the
// sum of its own offset and the currently selected custom emotion's offset.
export function getPortraitVerticalOffsetPx(actor, viewportHeight) {
  const flags = actor?.flags?.[MODULE_ID];
  const match = /^custom_(\d+)$/.exec(String(flags?.portraitEmotion ?? "none"));
  const emotion = match && Array.isArray(flags?.customEmotions)
    ? flags.customEmotions[Number(match[1])]
    : null;
  const percent = normalizePortraitOffsetPercent(flags?.portraitVerticalOffsetPercent)
    + normalizePortraitOffsetPercent(emotion?.verticalOffsetPercent);
  const shift = Math.max(0, finiteNumber(viewportHeight)) * percent / 100;
  return shift ? -shift : 0;
}

// Screen layout only. Do not use these values for Actor or Token dimensions.
export function resolvePortraitOffsets({
  width, height, leftPercent = 0, rightPercent = 0, bottomPercent = 0,
  legacyBottomPx = 0, sidebarWidth = 0, sidePaddingPx = 8, targetBand = 0.98
}) {
  width = Math.max(1, finiteNumber(width, 1));
  height = Math.max(1, finiteNumber(height, 1));
  const left = width * normalizePortraitOffsetPercent(leftPercent) / 100;
  const right = width * normalizePortraitOffsetPercent(rightPercent) / 100;
  const legacyBottom = Math.max(0, finiteNumber(legacyBottomPx));
  const verticalShift = height * normalizePortraitOffsetPercent(bottomPercent) / 100;
  const railWidth = Math.max(1, width - left - right);
  const leftPadding = Math.max(0, finiteNumber(sidePaddingPx));
  const rightPadding = leftPadding + Math.max(0, finiteNumber(sidebarWidth));
  return {
    left, right, railWidth,
    // Move both vertical edges equally so centered and bottom-aligned modes
    // translate by the full percentage without resizing the portrait area.
    top: verticalShift ? -verticalShift : 0,
    bottom: legacyBottom + verticalShift,
    legacyBottom,
    leftPadding, rightPadding,
    bandWidth: Math.max(1, Math.floor(railWidth * targetBand) - leftPadding - rightPadding)
  };
}
