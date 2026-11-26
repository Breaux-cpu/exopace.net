/* EXOpace studio scene: one chrome artifact + glass ring.
   No stars, starfields, galaxies, or space-dust particles.
   Skips itself on reduced-motion, missing WebGL, or when another
   WebGL app already owns the page (Cesium / MapLibre / mesh globe). */
(function () {
  "use strict";

  var THREE_SRC = "/mesh/three.min.js";
  var canvas = document.getElementById("exo-scene");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    canvas.replaceWith(fallback());
    return;
  }
  if (document.querySelector("#boot-void, #cesiumContainer, .cesium-widget, .maplibregl-map, #map, #globe, canvas.webgl")) {
    canvas.remove();
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
    renderer.toneMappingExposure = 1.12;
    if (renderer.physicallyCorrectLights !== undefined) renderer.physicallyCorrectLights = true;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    camera.position.set(0, 0.15, 4.35);

    var env = bakeStudio(THREE, renderer);
    if (env) scene.environment = env;

    var group = new THREE.Group();
    scene.add(group);

    var detail = mobile ? 16 : 36;
    var geo = new THREE.IcosahedronGeometry(1.12, detail);
    var mat = new THREE.MeshPhysicalMaterial({
      color: 0xc9d6de,
      metalness: 1,
      roughness: 0.1,
      envMapIntensity: 1.55,
      clearcoat: 0.65,
      clearcoatRoughness: 0.12,
    });
    hookDisplace(THREE, mat);
    var orb = new THREE.Mesh(geo, mat);
    group.add(orb);

    var ringGeo = new THREE.TorusGeometry(1.62, 0.045, mobile ? 12 : 24, mobile ? 80 : 180);
    var ringMatOpts = {
      color: 0xb9d8e6,
      metalness: 0.85,
      roughness: 0.08,
      envMapIntensity: 1.3,
    };
    if ("transmission" in new THREE.MeshPhysicalMaterial()) {
      ringMatOpts.transmission = 0.86;
      ringMatOpts.thickness = 0.55;
      ringMatOpts.ior = 1.42;
      ringMatOpts.transparent = true;
      ringMatOpts.opacity = 1;
    }
    var ring = new THREE.Mesh(ringGeo, new THREE.MeshPhysicalMaterial(ringMatOpts));
    ring.rotation.x = Math.PI / 2.35;
    group.add(ring);

    var disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 64),
      new THREE.MeshBasicMaterial({ color: 0x7ee0ff, transparent: true, opacity: 0.045, depthWrite: false })
    );
    disc.position.z = -1.4;
    group.add(disc);

    scene.add(new THREE.AmbientLight(0x6f7f8a, 0.35));
    var key = new THREE.DirectionalLight(0x7ee0ff, 1.4);
    key.position.set(3.2, 2.6, 2.4);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0xffb84d, 0.85);
    rim.position.set(-3.4, -1.2, 1.2);
    scene.add(rim);

    var pointer = { x: 0, y: 0 };
    var scroll = 0;
    var raf = 0;
    var last = performance.now();
    var running = true;

    function resize() {
      var w = canvas.clientWidth || window.innerWidth;
      var h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    window.addEventListener("pointermove", function (e) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
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
      if (mat.userData && mat.userData.uTime) mat.userData.uTime.value = t;
      group.rotation.y += dt * 0.22 + pointer.x * dt * 0.35;
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, pointer.y * 0.28 + scroll * 0.6, 0.06);
      ring.rotation.z = t * 0.18 + scroll * 1.2;
      orb.rotation.y = t * 0.12;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.22, 0.06);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.15 - pointer.y * 0.16, 0.06);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  function hookDisplace(THREE, mat) {
    mat.userData.uTime = { value: 0 };
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = mat.userData.uTime;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          [
            "#include <begin_vertex>",
            "vec3 nrm = normalize(position);",
            "float n = sin(dot(nrm, vec3(1.7, 2.2, 1.1)) * 3.2 + uTime * 0.7);",
            "n += 0.5 * sin(dot(nrm, vec3(2.4, 0.6, 1.8)) * 5.1 - uTime * 0.45);",
            "transformed += nrm * n * 0.13;",
          ].join("\n")
        );
    };
  }

  function bakeStudio(THREE, renderer) {
    try {
      var studio = new THREE.Scene();
      studio.background = new THREE.Color(0x070b12);
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
      panel(0x7ee0ff, 8, 8, new THREE.Vector3(-5.5, 2.2, 1.2), { y: Math.PI / 2 });
      panel(0xe8f4ff, 6, 4, new THREE.Vector3(5.2, 1.6, 0.4), { y: -Math.PI / 2 });
      panel(0xffb84d, 5, 3, new THREE.Vector3(2.4, -3.4, 2.0), { x: Math.PI / 2 });
      panel(0xf6fbff, 7, 4, new THREE.Vector3(0, 5.0, 0.2), { x: -Math.PI / 2 });
      panel(0x1a2630, 10, 10, new THREE.Vector3(0, 0, -6), null);
      panel(0x9ad8ea, 1.4, 8, new THREE.Vector3(0.6, 1.0, 5.4), { y: Math.PI });
      var pmrem = new THREE.PMREMGenerator(renderer);
      var tex = pmrem.fromScene(studio, 0.04).texture;
      pmrem.dispose();
      return tex;
    } catch (err) {
      return null;
    }
  }
})();
