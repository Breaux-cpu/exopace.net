/* EXOpace Radio — mobile 3D Earth. Rayleigh+Mie limb. Presence fade. */
(function (global) {
  const DEG = Math.PI / 180;
  const TEX = {
    day: "textures/earth-day.jpg",
    night: "textures/earth-night.jpg",
    water: "textures/earth-water.png",
  };

  const EARTH_VERT = `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
    void main(){
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position,1.0);
      vW = wp.xyz;
      vN = normalize(mat3(modelMatrix)*normal);
      vV = cameraPosition - wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const EARTH_FRAG = `
    uniform sampler2D tDay; uniform sampler2D tNight; uniform sampler2D tWater; uniform vec3 uSun;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      vec3 N = normalize(vN);
      vec3 L = normalize(uSun);
      vec3 V = normalize(vV);
      float ndl = dot(N,L);
      float day = smoothstep(-0.12, 0.22, ndl);
      float twilight = exp(-pow((ndl+0.02)*6.0,2.0));
      vec3 dayC = texture2D(tDay,vUv).rgb * 0.82;
      vec3 nightC = texture2D(tNight,vUv).rgb * vec3(1.9,1.25,0.5) * 2.2;
      vec3 col = mix(nightC, dayC, day);
      col += twilight * vec3(1.0,0.38,0.1) * 0.28;
      float water = texture2D(tWater,vUv).r;
      vec3 H = normalize(L+V);
      col += pow(max(dot(N,H),0.0), 40.0) * water * day * vec3(0.8,0.9,1.0) * 0.45;
      gl_FragColor = vec4(col,1.0);
    }`;

  // Cheap 8-sample Rayleigh+Mie — not a Fresnel sprite
  const ATMO_FRAG = `
    uniform vec3 uSun; uniform vec3 uCam;
    varying vec3 vW;
    const int S = 8;
    bool hit(vec3 o, vec3 d, float r, out float t0, out float t1){
      float b=dot(o,d); float c=dot(o,o)-r*r; float h=b*b-c;
      if(h<0.0) return false; h=sqrt(h); t0=-b-h; t1=-b+h; return t1>0.0;
    }
    void main(){
      vec3 rd = normalize(vW - uCam);
      float t0,t1;
      if(!hit(uCam, rd, 1.028, t0, t1)) discard;
      t0 = max(t0,0.0);
      float tg0,tg1;
      if(hit(uCam, rd, 1.0, tg0, tg1) && tg0>0.0) t1 = min(t1, tg0);
      if(t1<=t0) discard;
      vec3 sun = normalize(uSun);
      vec3 acc = vec3(0.0);
      float dt = (t1-t0)/float(S);
      for(int i=0;i<S;i++){
        vec3 p = uCam + rd*(t0+(float(i)+0.5)*dt);
        float h = max(0.0, length(p)-1.0);
        float dens = exp(-h/0.08);
        float mu = dot(rd, sun);
        float pr = 0.06*(1.0+mu*mu);
        float pm = 0.12*(1.0-0.58)/(pow(1.58-1.52*mu,1.5));
        vec3 ray = vec3(0.18,0.42,0.95)*pr;
        vec3 mie = vec3(0.95,0.88,0.75)*pm*0.35;
        float nds = dot(normalize(p), sun);
        vec3 twi = vec3(1.0,0.36,0.08)*exp(-pow(nds*4.0,2.0))*0.55;
        acc += (ray+mie+twi)*dens*dt*2.4;
      }
      float a = clamp(length(acc)*1.2, 0.0, 0.9);
      gl_FragColor = vec4(acc, a);
    }`;

  function latLonToVec3(lat, lon, r, out) {
    const th = (90 - lat) * DEG;
    const ph = (lon + 180) * DEG;
    const st = Math.sin(th);
    const x = -r * Math.cos(ph) * st;
    const y = r * Math.cos(th);
    const z = r * Math.sin(ph) * st;
    if (out) return out.set(x, y, z);
    return new THREE.Vector3(x, y, z);
  }

  function sunDir(d, out) {
    const jd = d.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545.0;
    const L = ((280.46 + 0.9856474 * n) % 360) * DEG;
    const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
    const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
    const eps = 23.439 * DEG;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
    gmst = (((gmst % 360) + 360) % 360) * DEG;
    let lon = ((ra - gmst) * 180) / Math.PI;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return latLonToVec3((dec * 180) / Math.PI, lon, 1, out).normalize();
  }

  function makeFallbackDay() {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#0b3a62"; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = "#2a6b3a";
    [[180, 200, 90], [520, 180, 110], [780, 240, 70], [300, 360, 80]].forEach(([x, y, r]) => {
      g.beginPath(); g.ellipse(x, y, r, r * 0.55, 0, 0, 7); g.fill();
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function loadTex(url, srgb) {
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(url, (t) => {
        t.anisotropy = 4;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        resolve(t);
      }, undefined, () => resolve(null));
    });
  }

  function ExoGlobe() {
    this.ready = false;
    this.active = false;
    this.markers = [];
    this.trail = [];
    this.heat = [];
    this.showTrail = false;
    this._sph = { theta: 0.9, phi: 1.15, r: 3.05 };
    this._drag = null;
  }

  ExoGlobe.prototype.mount = async function (canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x101208, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    this.renderer = renderer;
    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80);

    const [day, night, water] = await Promise.all([
      loadTex(TEX.day, true), loadTex(TEX.night, true), loadTex(TEX.water, false),
    ]);
    const tDay = day || makeFallbackDay();
    this.uniforms = {
      tDay: { value: tDay },
      tNight: { value: night || tDay },
      tWater: { value: water || tDay },
      uSun: { value: new THREE.Vector3(1, 0.2, 0.15) },
    };
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG }),
    ));

    this.atmoU = { uSun: { value: this.uniforms.uSun.value }, uCam: { value: this.camera.position } };
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.028, 40, 28),
      new THREE.ShaderMaterial({
        uniforms: this.atmoU, vertexShader: EARTH_VERT, fragmentShader: ATMO_FRAG,
        transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      }),
    ));

    const starN = 1800;
    const spos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const z = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(1 - z * z) * 28;
      spos[i * 3] = Math.cos(t) * rr;
      spos[i * 3 + 1] = z * 28;
      spos[i * 3 + 2] = Math.sin(t) * rr;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(spos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdde8ff, size: 0.04 })));

    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
    scene.add(this.sun);
    this.markGroup = new THREE.Group();
    this.trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.7 }));
    this.heatGroup = new THREE.Group();
    scene.add(this.markGroup, this.trailLine, this.heatGroup);

    this._bindInput(canvas);
    this.ready = true;
    this._resize();
    this._loop();
    return this;
  };

  ExoGlobe.prototype._bindInput = function (el) {
    const self = this;
    el.addEventListener("pointerdown", (e) => {
      self._drag = { x: e.clientX, y: e.clientY, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!self._drag) return;
      const dx = e.clientX - self._drag.x;
      const dy = e.clientY - self._drag.y;
      if (Math.hypot(dx, dy) > 4) self._drag.moved = true;
      self._drag.x = e.clientX; self._drag.y = e.clientY;
      self._sph.theta -= dx * 0.006;
      self._sph.phi = Math.max(0.12, Math.min(Math.PI - 0.12, self._sph.phi - dy * 0.006));
    });
    el.addEventListener("pointerup", (e) => {
      const d = self._drag; self._drag = null;
      if (d && !d.moved && self.onPick) self.onPick(self.pick(e.clientX, e.clientY));
    });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      self._sph.r = Math.max(1.35, Math.min(8, self._sph.r * Math.exp(e.deltaY * 0.0014)));
    }, { passive: false });
    let lastPinch = 0;
    el.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lastPinch) self._sph.r = Math.max(1.35, Math.min(8, self._sph.r * (lastPinch / d)));
        lastPinch = d;
        e.preventDefault();
      }
    }, { passive: false });
    el.addEventListener("touchend", () => { lastPinch = 0; });
  };

  ExoGlobe.prototype._resize = function () {
    if (!this.renderer) return;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(8, r.width | 0);
    const h = Math.max(8, r.height | 0);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  ExoGlobe.prototype._loop = function () {
    const self = this;
    const tick = () => {
      self._raf = requestAnimationFrame(tick);
      if (!self.ready) return;
      const r = self.canvas.getBoundingClientRect();
      if (Math.abs(r.width - self.renderer.domElement.width / (self.renderer.getPixelRatio() || 1)) > 2) self._resize();
      if (!self.active) {
        if (!self._drewOnce) { self._frame(); self._drewOnce = true; }
        return;
      }
      self._frame();
    };
    tick();
  };

  ExoGlobe.prototype._frame = function () {
    sunDir(new Date(), this.uniforms.uSun.value);
    this.sun.position.copy(this.uniforms.uSun.value).multiplyScalar(12);
    const { theta, phi, r } = this._sph;
    this.camera.position.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta));
    if (this.camera.position.length() < 1.18) this.camera.position.setLength(1.18);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  };

  ExoGlobe.prototype.setActive = function (on) { this.active = !!on; if (on) this._resize(); };

  ExoGlobe.prototype.setMarkers = function (list) {
    if (!this.markGroup) return;
    this.markers = list || [];
    while (this.markGroup.children.length) {
      const ch = this.markGroup.children[0];
      this.markGroup.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
    }
    this.markers.forEach((m) => {
      if (m.lat == null || m.lon == null) return;
      const p = latLonToVec3(m.lat, m.lon, 1.012);
      const conf = m.conf == null ? 1 : m.conf;
      const color = m.kind === "me" ? 0xffb454 : m.kind === "sos" ? 0xff5c5c : m.kind === "way" ? 0x9fd356 : m.kind === "st" ? 0x9a976f : 0x7ee0ff;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(m.kind === "me" ? 0.018 : 0.014, 10, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 + 0.78 * conf, toneMapped: false }),
      );
      mesh.position.copy(p);
      mesh.userData.marker = m;
      this.markGroup.add(mesh);
      if (m.kind === "me") {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.024, 0.03, 24),
          new THREE.MeshBasicMaterial({ color: 0xffb454, side: THREE.DoubleSide, toneMapped: false }),
        );
        ring.position.copy(p); ring.lookAt(0, 0, 0);
        this.markGroup.add(ring);
      }
    });
    this._syncTrail();
  };

  ExoGlobe.prototype.setTrail = function (pts, on) {
    this.trail = pts || [];
    this.showTrail = !!on;
    this._syncTrail();
  };

  ExoGlobe.prototype._syncTrail = function () {
    if (!this.trailLine) return;
    if (!this.showTrail || this.trail.length < 2) { this.trailLine.visible = false; return; }
    const arr = [];
    this.trail.forEach((p) => {
      const v = latLonToVec3(p[0], p[1], 1.008);
      arr.push(v.x, v.y, v.z);
    });
    this.trailLine.geometry.dispose();
    this.trailLine.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    this.trailLine.visible = true;
  };

  ExoGlobe.prototype.setHeat = function (samples) {
    this.heat = samples || [];
    while (this.heatGroup.children.length) {
      const ch = this.heatGroup.children[0];
      this.heatGroup.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
    }
    this.heat.forEach((s) => {
      if (s.lat == null) return;
      const p = latLonToVec3(s.lat, s.lon, 1.006);
      const t = Math.max(0, Math.min(1, (s.rssi + 130) / 60));
      const col = new THREE.Color().setHSL(0.12 * (1 - t) + 0.45 * t, 0.85, 0.45);
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(0.012 + (1 - t) * 0.02, 12),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
      );
      m.position.copy(p); m.lookAt(0, 0, 0);
      this.heatGroup.add(m);
    });
  };

  ExoGlobe.prototype.recage = function (lat, lon) {
    if (lat == null || lon == null) { this._sph = { theta: 0.9, phi: 1.15, r: 3.05 }; return; }
    const p = latLonToVec3(lat, lon, 1);
    this._sph.theta = Math.atan2(p.x, p.z);
    this._sph.phi = Math.acos(Math.max(-1, Math.min(1, p.y / p.length())));
    this._sph.r = 2.15;
  };

  ExoGlobe.prototype.pick = function (cx, cy) {
    if (!this.camera) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.markGroup.children, false);
    if (hits[0] && hits[0].object.userData.marker) return hits[0].object.userData.marker;
    return null;
  };

  global.ExoGlobe = ExoGlobe;
})(window);
