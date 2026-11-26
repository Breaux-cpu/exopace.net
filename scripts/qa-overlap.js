/** Page-side overlap collector. Passed to page.evaluate — must be a plain function. */
export function collectOverlap() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const skipSel = ".exo-skip, [hidden], [aria-hidden='true']";
  function clipToScrollers(el, r) {
    let x = r.left, y = r.top, right = r.right, bottom = r.bottom;
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const st = getComputedStyle(p);
      if (st.overflowX !== "visible" || st.overflowY !== "visible") {
        const pr = p.getBoundingClientRect();
        x = Math.max(x, pr.left);
        y = Math.max(y, pr.top);
        right = Math.min(right, pr.right);
        bottom = Math.min(bottom, pr.bottom);
      }
      p = p.parentElement;
    }
    return { left: x, top: y, right: right, bottom: bottom, width: right - x, height: bottom - y };
  }
  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches(skipSel)) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    if (st.pointerEvents === "none") return false;
    const raw = el.getBoundingClientRect();
    if (raw.width < 1 || raw.height < 1) return false;
    const r = clipToScrollers(el, raw);
    if (r.width < 1 || r.height < 1) return false;
    return r;
  }
  function scrollParentX(el) {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const st = getComputedStyle(p);
      if (/(auto|scroll)/.test(st.overflowX) && p.scrollWidth > p.clientWidth + 1) return p;
      p = p.parentElement;
    }
    return null;
  }
  const selector = "button, a, input, select, textarea, [role='button'], [role='tab'], [role='menuitem'], label, summary";
  const inter = [];
  for (const el of document.querySelectorAll(selector)) {
    const r = visible(el);
    if (!r) continue;
    const label = ((el.innerText || el.getAttribute("aria-label") || el.id || el.className || el.tagName) + "")
      .replace(/\s+/g, " ").trim().slice(0, 80);
    inter.push({
      label, tag: el.tagName, id: el.id,
      x: r.left, y: r.top, w: r.width, h: r.height,
      clipX: r.left < -1 || r.right > vw + 1,
      inScrollX: !!scrollParentX(el),
    });
  }
  const failures = [];
  for (const item of inter) {
    if (item.clipX && !item.inScrollX) {
      failures.push({ type: "overflow-x", a: item.label, detail: "right=" + (item.x + item.w).toFixed(1) + " vw=" + vw });
    }
  }
  function overlapArea(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.w, b.x + b.w);
    const btm = Math.min(a.y + a.h, b.y + b.h);
    const w = r - x;
    const h = btm - y;
    if (w <= 1 || h <= 1) return 0;
    return Math.max(0, Math.min(r, vw) - Math.max(x, 0)) * Math.max(0, Math.min(btm, vh) - Math.max(y, 0));
  }
  function contains(a, b) {
    return a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.w >= b.x + b.w - 1 && a.y + a.h >= b.y + b.h - 1;
  }
  for (let i = 0; i < inter.length; i++) {
    for (let j = i + 1; j < inter.length; j++) {
      const a = inter[i], b = inter[j];
      const area = overlapArea(a, b);
      if (area <= 1) continue;
      if (contains(a, b) || contains(b, a)) continue;
      failures.push({ type: "overlap", a: a.label, b: b.label, area: Math.round(area) });
    }
  }
  return { vw, vh, count: inter.length, failures };
}
