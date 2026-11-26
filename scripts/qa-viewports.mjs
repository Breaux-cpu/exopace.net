/** Shared viewport matrix for overlap and flow tests. CSS pixels. */
export const VIEWPORTS = [
  { id: "se", w: 375, h: 667, dpr: 2, touch: true, safe: { top: 0, bottom: 0 }, note: "iPhone SE" },
  { id: "mini", w: 375, h: 812, dpr: 3, touch: true, safe: { top: 44, bottom: 34 }, note: "iPhone 13 mini" },
  { id: "iphone", w: 393, h: 852, dpr: 3, touch: true, safe: { top: 47, bottom: 34 }, note: "iPhone 15/16" },
  { id: "promax", w: 430, h: 932, dpr: 3, touch: true, safe: { top: 47, bottom: 34 }, note: "iPhone 15/16 Pro Max" },
  { id: "pixel", w: 412, h: 915, dpr: 2.6, touch: true, safe: { top: 24, bottom: 24 }, note: "Pixel 7/8 / Fold cover 412" },
  { id: "s23", w: 360, h: 780, dpr: 3, touch: true, safe: { top: 24, bottom: 16 }, note: "Galaxy S23/S24 / Fold cover 360" },
  { id: "ultra", w: 384, h: 824, dpr: 2.8, touch: true, safe: { top: 24, bottom: 16 }, note: "Galaxy S Ultra" },
  { id: "small", w: 360, h: 640, dpr: 2, touch: true, safe: { top: 0, bottom: 0 }, note: "small Android" },
  { id: "fold-inner", w: 768, h: 840, dpr: 2.6, touch: true, safe: { top: 24, bottom: 16 }, note: "Fold inner 768" },
  { id: "fold-inner-tall", w: 904, h: 1000, dpr: 2.6, touch: true, safe: { top: 24, bottom: 16 }, note: "Fold inner 904" },
  { id: "fold-inner-land", w: 1000, h: 880, dpr: 2.6, touch: true, safe: { top: 24, bottom: 16 }, note: "Fold inner landscape" },
  { id: "ipad-mini", w: 744, h: 1133, dpr: 2, touch: true, safe: { top: 0, bottom: 20 }, note: "iPad mini" },
  { id: "ipad", w: 820, h: 1180, dpr: 2, touch: true, safe: { top: 0, bottom: 20 }, note: "iPad" },
  { id: "land-se", w: 667, h: 375, dpr: 2, touch: true, safe: { top: 0, bottom: 0 }, note: "SE landscape" },
  { id: "land-promax", w: 932, h: 430, dpr: 3, touch: true, safe: { top: 0, bottom: 21 }, note: "Pro Max landscape" },
  { id: "land-cover", w: 780, h: 360, dpr: 2.6, touch: true, safe: { top: 0, bottom: 16 }, note: "Fold cover landscape" },
  { id: "desktop", w: 1440, h: 900, dpr: 1, touch: false, safe: { top: 0, bottom: 0 }, note: "desktop 1440" },
];

export const PAGES = [
  { name: "mission", path: "/mission/", boot: true },
  { name: "maps", path: "/maps/" },
  { name: "legend", path: "/maps/legend.html" },
  { name: "cameras", path: "/cameras/" },
  { name: "radio", path: "/radio/" },
  { name: "unlock", path: "/radio/unlock.html" },
  { name: "mesh", path: "/mesh/" },
  { name: "sentinel", path: "/sentinel/" },
  { name: "system", path: "/system/" },
  { name: "404", path: "/404.html" },
  { name: "maintenance", path: "/maintenance/", allowRedirect: true },
];

export const SHOT_VIEWPORTS = ["pixel", "fold-inner-tall"];
