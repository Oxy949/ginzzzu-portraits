// Only the aspect ratio affects row fitting, not the image's pixel resolution.
export function portraitImageChangesRowFit(previous, next) {
  const oldRatio = previous?.naturalHeight > 0 ? previous.naturalWidth / previous.naturalHeight : 0;
  const newRatio = next?.naturalHeight > 0 ? next.naturalWidth / next.naturalHeight : 0;
  return newRatio > 0 && Math.abs(newRatio - oldRatio) > 0.000001;
}

export function resolvePortraitAspectRowFit({ heightsPx = [], aspectRatios = [], availableWidth,
  gap = 24, devicePixelRatio = 1, resizeToFit = true, allowOverlap = false }) {
  const count = heightsPx.length;
  const width = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const dpr = Number.isFinite(devicePixelRatio) ? Math.max(0.25, Math.min(8, devicePixelRatio)) : 1;
  const heights = heightsPx.map(height => Number.isFinite(height) ? Math.max(0, height) : 0);
  const ratios = heights.map((_, index) => {
    const ratio = aspectRatios[index];
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  });
  const artworkWidth = heights.reduce((total, height, index) => total + height * ratios[index], 0);
  const configuredGap = Math.max(0, Number.isFinite(gap) ? gap : 24);
  const idealGap = count > 1 ? (width - artworkWidth) / (count - 1) : 0;
  const gapPx = count <= 1
    ? 0
    : allowOverlap && !resizeToFit
      ? Math.min(configuredGap, idealGap)
      : Math.min(configuredGap, width / (4 * (count - 1)));
  const availableArtworkWidth = Math.max(0, width - gapPx * Math.max(0, count - 1));
  const scale = resizeToFit && artworkWidth > 0
    ? Math.min(1, availableArtworkWidth / artworkWidth)
    : 1;
  const fittedHeights = heights.map(height => scale < 1
    ? Math.floor(height * scale * dpr) / dpr
    : height);

  return {
    scale,
    gapPx,
    heightsPx: fittedHeights,
    widthsPx: fittedHeights.map((height, index) => height * ratios[index])
  };
}

// Fit actual artwork into separate, equally wide frames. One shared scale
// preserves relative character heights; height alone never triggers shrinking.
export function resolvePortraitRowFit({ heightsPx = [], aspectRatios = [], availableWidth,
  preferredSlotWidth = 520, gap = 24, devicePixelRatio = 1, enabled = true }) {
  if (!enabled) return null;
  const count = heightsPx.length;
  const width = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const dpr = Number.isFinite(devicePixelRatio) ? Math.max(0.25, Math.min(8, devicePixelRatio)) : 1;
  if (!count) return { scale: 1, heightsPx: [], slotWidthPx: 0, gapPx: 0 };
  // Reserve at least 3/4 of even a very crowded row for artwork, not gaps.
  const gapPx = count > 1 ? Math.min(Math.max(0, gap), width / (4 * (count - 1))) : 0;
  const frameBudget = Math.max(0, (width - gapPx * (count - 1)) / count);
  const heights = heightsPx.map(height => Number.isFinite(height) ? Math.max(0, height) : 0);
  let widest = 0;
  for (let index = 0; index < count; index++) {
    const ratio = Number.isFinite(aspectRatios[index]) && aspectRatios[index] > 0 ? aspectRatios[index] : 1;
    widest = Math.max(widest, heights[index] * ratio);
  }
  const slotWidthPx = Math.floor(Math.min(frameBudget, Math.max(preferredSlotWidth, widest)) * dpr) / dpr;
  const scale = widest > 0 ? Math.min(1, slotWidthPx / widest) : 1;
  return {
    scale, slotWidthPx, gapPx,
    // Round downward so pixel snapping cannot make the art overflow its frame.
    heightsPx: heights.map(height => scale < 1 ? Math.floor(height * scale * dpr) / dpr : height)
  };
}
