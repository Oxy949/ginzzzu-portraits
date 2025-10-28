/**
 * Small DOM helpers with zero dependencies.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  });
  for (const ch of (Array.isArray(children) ? children : [children])) {
    if (ch == null) continue;
    node.append(typeof ch === "string" ? document.createTextNode(ch) : ch);
  }
  return node;
}

export function byId(id) { return document.getElementById(id); }
