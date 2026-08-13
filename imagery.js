/* Tokenless world imagery → equirectangular canvas. Missing tiles → IMAGERY LIMITED. */
(function (g) {
  const MODES = {
    satellite: {
      label: "SATELLITE",
      // ArcGIS World Imagery — {z}/{y}/{x}
      url: (z, x, y) => `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      z: 2,
    },
    streets: {
      label: "STREETS",
      url: (z, x, y) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
      z: 2,
    },
    dark: {
      label: "DARK",
      url: (z, x, y) => `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
      z: 2,
    },
    hybrid: {
      label: "HYBRID",
      url: (z, x, y) => `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      overlay: (z, x, y) => `https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/${z}/${x}/${y}.png`,
      z: 2,
    },
  };

  function loadImg(src, ms) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const t = setTimeout(() => { img.src = ""; reject(new Error("tile timeout")); }, ms || 5000);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); reject(new Error("tile fail")); };
      img.src = src;
    });
  }

  async function compose(mode) {
    const def = MODES[mode] || MODES.satellite;
    const z = def.z;
    const n = 1 << z;
    const tile = 256;
    const c = document.createElement("canvas");
    c.width = n * tile;
    c.height = n * tile;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0a1020";
    ctx.fillRect(0, 0, c.width, c.height);
    let ok = 0, fail = 0;
    const jobs = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        jobs.push(
          loadImg(def.url(z, x, y), 4500)
            .then((img) => { ctx.drawImage(img, x * tile, y * tile, tile, tile); ok++; })
            .catch(() => { fail++; }),
        );
        if (def.overlay) {
          jobs.push(
            loadImg(def.overlay(z, x, y), 4500)
              .then((img) => { ctx.drawImage(img, x * tile, y * tile, tile, tile); })
              .catch(() => {}),
          );
        }
      }
    }
    await Promise.all(jobs);
    const limited = fail > 0 || ok === 0;
    return { canvas: c, ok, fail, limited, mode };
  }

  async function toTexture(mode) {
    const r = await compose(mode);
    if (r.ok === 0) return { tex: null, limited: true, mode: r.mode, ok: 0, fail: r.fail };
    const tex = new THREE.CanvasTexture(r.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return { tex, limited: r.limited, mode: r.mode, ok: r.ok, fail: r.fail };
  }

  g.ExoImagery = { MODES, compose, toTexture };
})(window);
