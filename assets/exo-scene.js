/* EXOpace studio scene: one chrome body in a gimbal, framed in a plinth.
   No stars, starfields, galaxies, or space-dust particles.
   Skips itself on reduced-motion, missing WebGL, app canvases, or Sentinel. */
(function () {
  "use strict";

  var THREE_SRC = "/mesh/three.min.js";
  var canvas = document.getElementById("exo-scene");
  if (!canvas) return;
  if (document.querySelector(".sn-main, #decode, .fm-body, .cam-stage, #composer, #boot-void, #cesiumContainer, .cesium-widget, .maplibregl-map, #map, #globe, canvas.webgl")) {
    canvas.remove();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    canvas.replaceWith(fallback());
    return;
  }

  var start = function () {
    loadScript(THREE_SRC).then(boot).catch(function () {
      canvas.replaceWith(fallback());
    });
  };

  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 900 });
  else setTimeout(start, 120);

  function fallback() {
    var el = document.createElement("div");
    el.className = "exo-scene-fallback";
    el.setAttribute("aria-hidden", "true");
    var body = document.createElement("div");
    body.className = "exo-fallback-body";
    var ring = document.createElement("div");
    ring.className = "exo-fallback-ring";
    el.appendChild(body);
    el.appendChild(ring);
    return el;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.THREE) return resolve(window.THREE);
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { window.THREE ? resolve(window.THREE) : reject(new Error("no THREE")); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function boot(THREE) {
    var gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) {
      canvas.replaceWith(fallback());
      return;
    }

    var mobile = window.matchMedia("(max-width: 800px)").matches || (navigator.hardwareConcurrency || 8) <= 4;
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      context: gl,
      antialias: !mobile,
      alpha: true,
      powerPreference: mobile ? "low-power" : "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6));
    if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    if (renderer.physicallyCorrectLights !== undefined) renderer.physicallyCorrectLights = true;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
    camera.position.set(0, 0.04, 6.6);

    var env = bakeStudio(THREE, renderer);
    if (env) scene.environment = env;

    var group = new THREE.Group();
    group.scale.setScalar(0.86);
    scene.add(group);

    var body = new THREE.Mesh(
      new THREE.SphereGeometry(1.02, mobile ? 32 : 64, mobile ? 24 : 48),
      new THREE.MeshPhysicalMaterial({
        color: 0xd5e0e6,
        metalness: 1,
        roughness: 0.08,
        envMapIntensity: 1.45,
        clearcoat: 0.85,
        clearcoatRoughness: 0.08,
      })
    );
    group.add(body);

    var ringMat = new THREE.MeshPhysicalMaterial({
      color: 0xc5d8e2,
      metalness: 0.95,
      roughness: 0.12,
      envMapIntensity: 1.25,
    });
    var ringA = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.028, mobile ? 10 : 16, mobile ? 80 : 160), ringMat);
    ringA.rotation.x = Math.PI / 2.15;
    group.add(ringA);
    var ringB = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.018, mobile ? 10 : 16, mobile ? 80 : 160), ringMat.clone());
    ringB.rotation.x = Math.PI / 1.55;
    ringB.rotation.y = 0.55;
    group.add(ringB);

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.35;
    group.add(shadow);

    scene.add(new THREE.AmbientLight(0x7a8a94, 0.28));
    var key = new THREE.DirectionalLight(0xf2fbff, 1.55);
    key.position.set(2.8, 3.2, 3.4);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0x7ee0ff, 0.55);
    fill.position.set(-3.2, 0.6, 2.0);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffb84d, 0.7);
    rim.position.set(-1.6, -2.4, 1.6);
    scene.add(rim);

    var pointer = { x: 0, y: 0 };
    var scroll = 0;
    var raf = 0;
    var last = performance.now();
    var running = true;

    function frameSize() {
      var r = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width) || canvas.clientWidth || 1);
      var h = Math.max(1, Math.round(r.height) || canvas.clientHeight || 1);
      return { w: w, h: h, r: r };
    }

    function resize() {
      var s = frameSize();
      renderer.setSize(s.w, s.h, false);
      camera.aspect = s.w / s.h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });
    if (typeof ResizeObserver === "function") {
      var ro = new ResizeObserver(resize);
      ro.observe(canvas.parentElement || canvas);
    }

    window.addEventListener("pointermove", function (e) {
      var s = frameSize();
      if (s.r.width < 1) return;
      pointer.x = ((e.clientX - s.r.left) / s.r.width) * 2 - 1;
      pointer.y = ((e.clientY - s.r.top) / s.r.height) * 2 - 1;
    }, { passive: true });

    window.addEventListener("scroll", function () {
      var doc = document.documentElement;
      var max = Math.max(1, doc.scrollHeight - window.innerHeight);
      scroll = window.scrollY / max;
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      running = document.visibilityState !== "hidden";
      if (running && !raf) raf = requestAnimationFrame(tick);
    });

    function tick(now) {
      raf = 0;
      if (!running || !canvas.isConnected) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      var t = now * 0.001;
      group.rotation.y += dt * 0.18 + pointer.x * dt * 0.28;
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, pointer.y * 0.22 + scroll * 0.35, 0.06);
      ringA.rotation.z = t * 0.14;
      ringB.rotation.z = -t * 0.1;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.18, 0.06);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.08 - pointer.y * 0.12, 0.06);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  function bakeStudio(THREE, renderer) {
    try {
      var studio = new THREE.Scene();
      studio.background = new THREE.Color(0x0a0e14);
      function panel(color, w, h, pos, rot) {
        var m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide })
        );
        m.position.copy(pos);
        if (rot) m.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
        studio.add(m);
      }
      // Colored softboxes only — no sky dome, no stars.
      panel(0xf4fbff, 6, 4, new THREE.Vector3(4.6, 2.4, 1.2), { y: -Math.PI / 2 });
      panel(0x7ee0ff, 5, 6, new THREE.Vector3(-5.0, 1.4, 0.8), { y: Math.PI / 2 });
      panel(0xffb84d, 4, 2.4, new THREE.Vector3(1.6, -3.2, 1.8), { x: Math.PI / 2 });
      panel(0xffffff, 6, 3, new THREE.Vector3(0, 5.0, 0.4), { x: -Math.PI / 2 });
      panel(0x151c24, 10, 10, new THREE.Vector3(0, 0, -6), null);
      panel(0xd7e8f0, 1.1, 6, new THREE.Vector3(0.4, 1.2, 5.2), { y: Math.PI });
      var pmrem = new THREE.PMREMGenerator(renderer);
      var tex = pmrem.fromScene(studio, 0.05).texture;
      pmrem.dispose();
      return tex;
    } catch (err) {
      return null;
    }
  }
})();
