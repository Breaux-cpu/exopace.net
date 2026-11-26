/* EXOpace home scene: one instrument-grade planet with real coastlines and
   night lights (the Mesh textures), three orbit planes with live-moving
   markers, and the Memphis ground station uplink. No stars, no starfield,
   no particles. Falls back to a still CSS body on reduced motion or no WebGL. */
(function () {
  "use strict";

  var canvas = document.getElementById("hm-scene");
  if (!canvas) return;
  var THREE_SRC = "/mesh/three.min.js";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fallback() {
    var el = document.createElement("div");
    el.className = "hm-scene-fallback";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="hm-fb-planet"></div><div class="hm-fb-ring"></div><div class="hm-fb-ring b"></div>';
    canvas.replaceWith(el);
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

  var start = function () { loadScript(THREE_SRC).then(boot).catch(fallback); };
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 700 });
  else setTimeout(start, 80);

  function latLon(THREE, lat, lon, r) {
    var phi = (90 - lat) * Math.PI / 180;
    var theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  }

  function boot(THREE) {
    var gl = null;
    try { gl = canvas.getContext("webgl2") || canvas.getContext("webgl"); } catch (e) {}
    if (!gl) return fallback();

    var mobile = window.matchMedia("(max-width: 800px)").matches || (navigator.hardwareConcurrency || 8) <= 4;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl, antialias: true, alpha: true, powerPreference: mobile ? "low-power" : "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 0.35, 9.4);

    var world = new THREE.Group();
    world.rotation.z = -0.41; // axial tilt
    scene.add(world);
    var planet = new THREE.Group();
    world.add(planet);

    var loader = new THREE.TextureLoader();
    var blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    blank.needsUpdate = true;
    var dark = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    dark.needsUpdate = true;

    var sun = new THREE.Vector3(1.0, 0.35, 0.55).normalize();
    var uniforms = {
      uWater: { value: blank },
      uNight: { value: dark },
      uSun: { value: sun.clone() },
      uTime: { value: 0 },
    };
    var seg = mobile ? 72 : 128;
    var earth = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, seg, seg / 2),
      new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: [
          "varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vView;",
          "void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz;",
          " vN=normalize(mat3(modelMatrix)*normal); vView=normalize(cameraPosition-w.xyz);",
          " gl_Position=projectionMatrix*viewMatrix*w; }"
        ].join("\n"),
        fragmentShader: [
          "uniform sampler2D uWater; uniform sampler2D uNight; uniform vec3 uSun; uniform float uTime;",
          "varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vView;",
          "float grid(vec2 uv, vec2 n, float w){ vec2 g=abs(fract(uv*n-0.5)-0.5)/fwidth(uv*n); return 1.0-min(min(g.x,g.y)/w,1.0); }",
          "void main(){",
          " vec2 px=vec2(1.0/1024.0,1.0/512.0);",
          " float water=(texture2D(uWater,vUv).r*2.0+texture2D(uWater,vUv+vec2(px.x,0.0)).r+texture2D(uWater,vUv-vec2(px.x,0.0)).r+texture2D(uWater,vUv+vec2(0.0,px.y)).r+texture2D(uWater,vUv-vec2(0.0,px.y)).r)/6.0;",
          " float land=1.0-water;",
          " float edge=smoothstep(0.15,0.5,water)*(1.0-smoothstep(0.5,0.85,water));",
          " float day=dot(normalize(vN),uSun);",
          " float lit=smoothstep(-0.18,0.35,day);",
          " vec3 sea=vec3(0.012,0.028,0.045);",
          " vec3 ground=vec3(0.10,0.15,0.18);",
          " vec3 col=mix(sea,ground,land)*(0.25+0.95*lit);",
          " col+=vec3(0.49,0.88,1.0)*edge*0.55*(0.35+0.65*lit);",
          " float g=grid(vUv,vec2(24.0,12.0),1.0);",
          " col+=vec3(0.49,0.88,1.0)*g*0.10;",
          " vec3 lights=texture2D(uNight,vUv).rgb;",
          " float night=1.0-smoothstep(-0.25,0.12,day);",
          " col+=vec3(1.0,0.72,0.30)*pow(max(lights.r,max(lights.g,lights.b)),1.6)*night*1.35;",
          " float spec=pow(max(dot(reflect(-uSun,normalize(vN)),vView),0.0),40.0)*water*lit;",
          " col+=vec3(0.75,0.9,1.0)*spec*0.35;",
          " float rim=pow(1.0-max(dot(normalize(vN),vView),0.0),3.0);",
          " col+=vec3(0.49,0.88,1.0)*rim*0.55;",
          " gl_FragColor=vec4(col,1.0);",
          "}"
        ].join("\n"),
        extensions: { derivatives: true },
      })
    );
    planet.add(earth);

    // Atmosphere shell: cyan fresnel halo, additive.
    var halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.62, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: { uSun: uniforms.uSun },
        vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }",
        fragmentShader: "uniform vec3 uSun; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.0-abs(dot(vN,vV)),2.6); float s=0.45+0.55*smoothstep(-0.4,0.6,dot(vN,uSun)); gl_FragColor=vec4(vec3(0.42,0.82,1.0)*f*s*1.1,f*s); }",
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    world.add(halo);

    function texReady() { if (reduce) render(t0 + 4000); }
    loader.load("/mesh/textures/earth-water.png", function (t) { uniforms.uWater.value = t; texReady(); });
    loader.load("/mesh/textures/earth-night.jpg", function (t) { uniforms.uNight.value = t; texReady(); });

    // Memphis ground station: amber beacon + uplink beam.
    var gsPos = latLon(THREE, 35.15, -90.05, 1.5);
    var gs = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb84d }));
    gs.position.copy(gsPos);
    planet.add(gs);
    var ringGeo = new THREE.RingGeometry(0.05, 0.062, 40);
    var pulse = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    pulse.position.copy(gsPos.clone().multiplyScalar(1.002));
    pulse.lookAt(gsPos.clone().multiplyScalar(2));
    planet.add(pulse);

    // Orbit planes (LEO-ish, polar, MEO), thin cyan lines with amber markers.
    var orbits = [];
    function addOrbit(radius, incl, raan, speed, phase, color) {
      var pts = [];
      for (var i = 0; i <= 256; i++) {
        var a = (i / 256) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      var plane = new THREE.Group();
      plane.rotation.set(incl, raan, 0);
      var line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.38, depthWrite: false })
      );
      plane.add(line);
      var sat = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffb84d }));
      var glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
      sat.add(glow);
      plane.add(sat);
      world.add(plane);
      orbits.push({ plane: plane, sat: sat, r: radius, speed: speed, phase: phase });
    }
    addOrbit(1.86, 0.9, 0.2, 0.42, 0.0, 0x7ee0ff);
    addOrbit(2.08, 1.55, 1.9, 0.3, 2.1, 0x7ee0ff);
    addOrbit(2.5, 0.32, 3.4, 0.17, 4.0, 0x9fb0b4);

    // Uplink: a live line from the station to whichever marker is closest.
    var linkGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    var link = new THREE.Line(linkGeo, new THREE.LineBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.0, depthWrite: false }));
    world.add(link);

    var pointer = { x: 0, y: 0 };
    var raf = 0, last = performance.now(), running = true, t0 = last;
    var tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), gsWorld = new THREE.Vector3();

    function resize() {
      var r = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the whole planet + outer orbit in frame on tall phone banners.
      var fit = camera.aspect < 1 ? 9.0 / Math.max(camera.aspect, 0.6) : 9.4;
      camera.position.z = Math.min(fit, 13);
      camera.updateProjectionMatrix();
      if (!raf) render(performance.now());
    }
    window.addEventListener("resize", resize, { passive: true });
    if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(canvas.parentElement || canvas);

    window.addEventListener("pointermove", function (e) {
      pointer.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointer.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      running = document.visibilityState !== "hidden";
      if (running && !raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(tick); }
    });

    function render(now) {
      var t = (now - t0) / 1000;
      uniforms.uTime.value = t;
      planet.rotation.y = 1.9 + t * 0.06;
      for (var i = 0; i < orbits.length; i++) {
        var o = orbits[i], a = o.phase + t * o.speed;
        o.sat.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
      }
      var p = (t * 0.6) % 1;
      pulse.scale.setScalar(1 + p * 3.2);
      pulse.material.opacity = 0.85 * (1 - p);
      // Station → nearest marker uplink, only when the marker is above the station's horizon.
      gs.getWorldPosition(gsWorld);
      var best = null, bestD = 1e9;
      for (var j = 0; j < orbits.length; j++) {
        orbits[j].sat.getWorldPosition(tmpA);
        tmpB.copy(tmpA).sub(gsWorld);
        var up = tmpB.clone().normalize().dot(gsWorld.clone().normalize());
        if (up > 0.15 && tmpB.length() < bestD) { bestD = tmpB.length(); best = tmpA.clone(); }
      }
      var pos = linkGeo.attributes.position;
      var wInv = world.matrixWorld.clone().invert();
      if (best) {
        var aL = gsWorld.clone().applyMatrix4(wInv), bL = best.applyMatrix4(wInv);
        pos.setXYZ(0, aL.x, aL.y, aL.z); pos.setXYZ(1, bL.x, bL.y, bL.z); pos.needsUpdate = true;
        link.material.opacity = Math.min(0.9, link.material.opacity + 0.04);
      } else {
        link.material.opacity = Math.max(0, link.material.opacity - 0.04);
      }
      world.rotation.x = THREE.MathUtils.lerp(world.rotation.x, pointer.y * 0.12, 0.05);
      world.rotation.y = THREE.MathUtils.lerp(world.rotation.y, pointer.x * 0.22, 0.05);
      camera.lookAt(0, 0, 0);
      scene.updateMatrixWorld();
      renderer.render(scene, camera);
    }

    function tick(now) {
      raf = 0;
      if (!running || !canvas.isConnected) return;
      last = now;
      render(now);
      raf = requestAnimationFrame(tick);
    }
    resize();
    canvas.classList.add("is-live");
    if (reduce) render(t0 + 4000);
    else raf = requestAnimationFrame(tick);
  }
})();
