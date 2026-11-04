// Return the grabbed point relative to the displayed transform origin, in the
// coordinate system used by the portrait's translate() (before idle breathing).
export function getPortraitTransformAnchor({ point, rect, width, height, origin, matrix, scale = 1 }) {
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => ({
    x: matrix.a * (x - origin.x) + matrix.c * (y - origin.y),
    y: matrix.b * (x - origin.x) + matrix.d * (y - origin.y)
  }));
  return {
    x: (point.x - rect.left) / scale + Math.min(...corners.map(corner => corner.x)),
    y: (point.y - rect.top) / scale + Math.min(...corners.map(corner => corner.y))
  };
}

// Preserve the grabbed point while keeping the usual center/floor origin.
// Baking this compensation into translation also preserves the saved pose.
export function getPortraitTransformPivotOffset(anchor, scale, rotationDeg) {
  if (!anchor) return { x: 0, y: 0 };
  const angle = rotationDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return {
    x: anchor.x - scale * (cos * anchor.x - sin * anchor.y),
    y: anchor.y - scale * (sin * anchor.x + cos * anchor.y)
  };
}
