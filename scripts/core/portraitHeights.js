import { MODULE_ID } from "./constants.js";

function multiplier(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 1;
}

export function getPortraitHeightMultiplier(actor) {
  const flags = actor?.flags?.[MODULE_ID];
  const value = multiplier(flags?.portraitHeightMultiplier) * multiplier(flags?.emotionHeightMultiplier);
  return Number.isFinite(value) ? value : 1;
}

// Height deliberately has no dependency on offsets, card width, or row count.
// Oversized portraits keep their scale and are clipped by the screen viewport.
export function resolvePortraitHeights({ viewportHeight, portraitHeight = 0.8, multipliers = [], devicePixelRatio = 1 }) {
  const viewport = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const fraction = Number.isFinite(portraitHeight) ? Math.max(0, portraitHeight) : 0.8;
  const dpr = Number.isFinite(devicePixelRatio) ? Math.max(0.25, Math.min(8, devicePixelRatio)) : 1;
  const snap = value => Number.isFinite(value) ? Math.round(value * dpr) / dpr : 0;
  const baseHeightPx = snap(viewport * fraction);
  return {
    baseHeightPx,
    heightsPx: multipliers.map(value => snap(baseHeightPx * multiplier(value)))
  };
}
