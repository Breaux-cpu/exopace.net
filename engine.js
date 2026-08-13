/* EXOpace MOC engine — vanilla THREE. Rayleigh+Mie, damped camera, SGP4. */
(function (g) {
  const DEG = Math.PI / 180;
  const EARTH_R_KM = 6371;
  const MIN_R = 1.18, MAX_R = 14, DAMP = 6.2;
  const satlib = g.satellite;
  const STATION = (g.ExoProto && g.ExoProto.STATION) || { lat: 35.346, lon: -89.836 };

  function latLonToVec3(lat, lon, r, out) {
    const th = (90 - lat) * DEG, ph = (lon + 180) * DEG, st = Math.sin(th);
    const v = out || new THREE.Vector3();
    return v.set(-r * Math.cos(ph) * st, r * Math.cos(th), r * Math.sin(ph) * st);
  }
  function sunDir(d, out) {
    const jd = d.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545.0;
    const L = ((280.46 + 0.9856474 * n) % 360) * DEG;
    const gA = ((357.528 + 0.9856003 * n) % 360) * DEG;
    const lam = L + (1.915 * Math.sin(gA) + 0.02 * Math.sin(2 * gA)) * DEG;
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
  function tleChecksum(line) {
    let s = 0;
    for (let i = 0; i < 68 && i < line.length; i++) {
      const c = line[i];
      if (c >= "0" && c <= "9") s += c.charCodeAt(0) - 48;
      else if (c === "-") s += 1;
    }
    return String(s % 10);
  }
  function padL(s, n) { return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s; }
  function fmtN(n, w) { return padL(n.toFixed(4), w); }

  const ATMO_VERT = `
    varying vec3 vWorldPos;
    void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vWorldPos=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`;
  const ATMO_FRAG = `
    precision highp float;
    uniform vec3 uSun; uniform vec3 uCam; uniform float uInner; uniform float uOuter; uniform float uExposure;
    varying vec3 vWorldPos;
    const int SAMPLES=12;
    const vec3 BETA_R=vec3(5.8e-6,13.5e-6,33.1e-6)*1.55e5;
    const vec3 BETA_M=vec3(21e-6)*1.15e5;
    const float G=0.76; const float H_R=0.085; const float H_M=0.012;
    bool sphere(vec3 o,vec3 d,float r,out float t0,out float t1){
      float b=dot(o,d); float c=dot(o,o)-r*r; float h=b*b-c;
      if(h<0.0) return false; h=sqrt(h); t0=-b-h; t1=-b+h; return t1>0.0;
    }
    float phaseR(float mu){ return 0.0596831*(1.0+mu*mu); }
    float phaseM(float mu){ float g2=G*G; return 0.1193662*(1.0-g2)*(1.0+mu*mu)/pow(1.0+g2-2.0*G*mu,1.5); }
    vec3 optical(vec3 p,vec3 dir,float tMax){
      float dt=tMax/float(SAMPLES); vec3 acc=vec3(0.0);
      for(int i=0;i<SAMPLES;i++){ vec3 s=p+dir*((float(i)+0.5)*dt); float h=length(s)-uInner; acc+=exp(-h/vec3(H_R,H_R,H_M))*dt; }
      return acc;
    }
    void main(){
      vec3 rd=normalize(vWorldPos-uCam); float tEnter,tExit;
      if(!sphere(uCam,rd,uOuter,tEnter,tExit)) discard;
      tEnter=max(tEnter,0.0); float tG0,tG1;
      if(sphere(uCam,rd,uInner,tG0,tG1)&&tG0>0.0) tExit=min(tExit,tG0);
      if(tExit<=tEnter) discard;
      float len=tExit-tEnter; float dt=len/float(SAMPLES);
      vec3 sun=normalize(uSun); vec3 sumR=vec3(0.0); vec3 sumM=vec3(0.0);
      for(int i=0;i<SAMPLES;i++){
        vec3 p=uCam+rd*(tEnter+(float(i)+0.5)*dt);
        float h=max(0.0,length(p)-uInner);
        float dR=exp(-h/H_R); float dM=exp(-h/H_M);
        float tS0,tS1; if(!sphere(p,sun,uOuter,tS0,tS1)) continue;
        vec3 od=optical(p,sun,tS1);
        vec3 tau=BETA_R*od.x+BETA_M*od.z*1.1;
        vec3 attn=exp(-tau);
        sumR+=dR*attn*dt; sumM+=dM*attn*dt;
      }
      float mu=dot(rd,sun);
      vec3 color=sumR*BETA_R*phaseR(mu)+sumM*BETA_M*phaseM(mu);
      float limb=1.0-abs(dot(normalize(vWorldPos),rd));
      float twi=exp(-pow(dot(normalize(vWorldPos),sun)*4.2,2.0));
      color+=vec3(1.0,0.38,0.08)*twi*limb*0.18;
      color*=uExposure;
      gl_FragColor=vec4(color, clamp(length(color)*1.35,0.0,0.97));
    }`;
  const EARTH_VERT = `
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*wp; }`;
  const EARTH_FRAG = `
    uniform sampler2D tDay; uniform sampler2D tNight; uniform sampler2D tWater; uniform sampler2D tClouds;
    uniform vec3 uSun; uniform float uClouds; uniform float uNightBoost;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 N=normalize(vN); vec3 L=normalize(uSun); vec3 V=normalize(cameraPosition-vW);
      float ndl=dot(N,L); float day=smoothstep(-0.08,0.28,ndl);
      float twilight=exp(-pow((ndl+0.015)*5.4,2.0));
      vec3 dayC=texture2D(tDay,vUv).rgb; vec3 nightC=texture2D(tNight,vUv).rgb*vec3(1.7,1.15,0.55)*uNightBoost;
      vec3 col=mix(nightC, dayC*0.92, day);
      col+=twilight*vec3(1.05,0.42,0.12)*0.32;
      float water=texture2D(tWater,vUv).r;
      vec3 H=normalize(L+V);
      col+=pow(max(dot(N,H),0.0),48.0)*water*day*vec3(0.75,0.88,1.0)*0.55;
      float clouds=texture2D(tClouds,vUv).r*uClouds;
      vec3 cloudCol=mix(vec3(0.04,0.05,0.07),vec3(0.96,0.97,1.0),day);
      col=mix(col,cloudCol,clouds*mix(0.25,0.85,day));
      gl_FragColor=vec4(col,1.0);
    }`;

  const QUALITY = {
    ULTRA: { id: "ULTRA", pr: 2, earth: 128, atmo: 96, stars: 10000, milky: true, clouds: true, satCap: 320 },
    HIGH: { id: "HIGH", pr: 1.6, earth: 96, atmo: 72, stars: 7000, milky: true, clouds: true, satCap: 200 },
    MED: { id: "MED", pr: 1.25, earth: 72, atmo: 48, stars: 3500, milky: false, clouds: true, satCap: 120 },
    PERF: { id: "PERF", pr: 1, earth: 48, atmo: 32, stars: 1600, milky: false, clouds: false, satCap: 64 },
  };

  function detectQuality() {
    try { const s = localStorage.getItem("exopace-quality"); if (s && QUALITY[s]) return s; } catch (e) {}
    const ua = navigator.userAgent || "";
    const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (mobile || mem <= 4 || cores <= 4) return "PERF";
    if (mem >= 8 && cores >= 8) return "HIGH";
    return "MED";
  }

  function wrapDelta(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function MocCamera(camera) {
    this.camera = camera;
    this.mode = "moc";
    this.sph = { theta: 1.72, phi: 0.95, r: 3.55 };
    this.target = { theta: 1.72, phi: 0.95, r: 3.55 };
    this.look = new THREE.Vector3();
    this.lookT = new THREE.Vector3();
    this.reduced = false;
    this.cineT = 0;
  }
  MocCamera.prototype.setMode = function (m) { if (m !== "cinematic") this.cineAbort = true; this.mode = m; if (m === "moc") this.home(); };
  MocCamera.prototype.home = function () {
    if (this.mode === "follow" || this.mode === "satcam" || this.mode === "cinematic") this.mode = "moc";
    this.target = { theta: 1.72, phi: 0.95, r: 3.55 };
    this.lookT.set(0, 0, 0);
  };
  MocCamera.prototype.recage = function (lat, lon, r) {
    const p = latLonToVec3(lat, lon, 1);
    this.target.theta = Math.atan2(p.x, p.z);
    this.target.phi = Math.acos(THREE.MathUtils.clamp(p.y, -1, 1));
    this.target.r = r || 2.4;
    this.lookT.set(0, 0, 0);
    if (this.mode === "cinematic") this.mode = "moc";
  };
  MocCamera.prototype.orbit = function (dx, dy) {
    if (this.mode === "cinematic" || this.mode === "moc") this.mode = "free";
    this.target.theta -= dx;
    this.target.phi = THREE.MathUtils.clamp(this.target.phi - dy, 0.08, Math.PI - 0.08);
  };
  MocCamera.prototype.dolly = function (f) {
    if (this.mode === "cinematic" || this.mode === "moc") this.mode = "free";
    this.target.r = THREE.MathUtils.clamp(this.target.r * f, MIN_R, MAX_R);
  };
  MocCamera.prototype.northUp = function () { this.target.theta = 0; this.target.phi = 0.02; };
  MocCamera.prototype.startCinematic = function () { this.mode = "cinematic"; this.cineT = 0; this.cineAbort = false; };
  MocCamera.prototype.abortCinematic = function () { this.cineAbort = true; if (this.mode === "cinematic") this.mode = "moc"; };
  MocCamera.prototype.applyFollow = function (pos, vel) {
    const plen = pos.length();
    if (plen < 1e-4) { this.home(); return; }
    const radial = pos.clone().multiplyScalar(1 / plen);
    let back = vel && vel.lengthSq() > 1e-10 ? vel.clone().normalize().multiplyScalar(-1) : new THREE.Vector3(0, 0, 1);
    const inward = back.dot(radial);
    if (inward < -0.2) back.addScaledVector(radial, -inward + 0.15).normalize();
    const cam = pos.clone().addScaledVector(radial, 0.18).addScaledVector(back, 0.22);
    if (cam.length() < MIN_R) cam.setLength(MIN_R + 0.04);
    if (cam.length() < plen * 0.55) cam.copy(radial).multiplyScalar(Math.max(plen + 0.25, MIN_R + 0.1));
    const r = THREE.MathUtils.clamp(cam.length(), MIN_R, MAX_R);
    this.target.r = r;
    this.target.theta = Math.atan2(cam.x, cam.z);
    this.target.phi = Math.acos(THREE.MathUtils.clamp(cam.y / r, -1, 1));
    this.lookT.copy(pos);
  };
  MocCamera.prototype.applySatCam = function (pos) {
    const plen = Math.max(pos.length(), 1.01);
    const radial = pos.clone().multiplyScalar(1 / plen);
    const cam = pos.clone().addScaledVector(radial, 0.045);
    if (cam.length() < MIN_R) cam.setLength(MIN_R);
    const r = cam.length();
    this.target.r = r;
    this.target.theta = Math.atan2(cam.x, cam.z);
    this.target.phi = Math.acos(THREE.MathUtils.clamp(cam.y / r, -1, 1));
    this.lookT.set(0, 0, 0);
  };
  MocCamera.prototype.tick = function (dt, selPos, selVel) {
    if (this.mode === "follow" && selPos) this.applyFollow(selPos, selVel);
    else if (this.mode === "satcam" && selPos) this.applySatCam(selPos);
    else if (this.mode === "cinematic" && !this.cineAbort) this._cine(dt, selPos);
    else if (this.mode === "moc" && !this.reduced) this.target.theta += dt * 0.018;
    const k = 1 - Math.exp(-DAMP * dt);
    this.sph.theta += wrapDelta(this.sph.theta, this.target.theta) * k;
    this.sph.phi += (this.target.phi - this.sph.phi) * k;
    this.sph.r += (this.target.r - this.sph.r) * k;
    this.sph.r = THREE.MathUtils.clamp(this.sph.r, MIN_R, MAX_R);
    this.look.lerp(this.lookT, k);
    const { theta, phi, r } = this.sph;
    this.camera.position.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta));
    if (this.camera.position.length() < MIN_R) this.camera.position.setLength(MIN_R);
    this.camera.lookAt(this.look);
  };
  MocCamera.prototype._cine = function (dt, selPos) {
    this.cineT += dt;
    const t = this.cineT;
    if (t < 6) { this.target.r = 4.2 - t * 0.12; this.target.phi = 0.95; this.target.theta = 1.72 + t * 0.08; this.lookT.set(0, 0, 0); }
    else if (t < 14 && selPos) { this.applyFollow(selPos, new THREE.Vector3()); this.target.r = Math.max(this.target.r, 1.45); }
    else if (t < 22) { this.target.r = 6.2; this.target.phi = 0.55; this.target.theta = t * 0.12; this.lookT.set(0, 0, 0); }
    else { this.mode = "moc"; this.home(); }
  };

  function makeTle(s) {
    const n5 = String(s.norad).padStart(5, "0");
    const ecc = Math.round(s.ecc * 1e7).toString().padStart(7, "0");
    const l1b = `1 ${n5}U 98067A   26226.50000000  .00001234  00000-0  25000-4 0  999`;
    const l2b = `2 ${n5} ${fmtN(s.inc, 8)} ${fmtN(s.raan, 8)} ${ecc} ${fmtN(s.aop, 8)} ${fmtN(s.ma, 8)} ${fmtN(s.mm, 11)}    0`;
    return [l1b.padEnd(68, " ") + tleChecksum(l1b), l2b.padEnd(68, " ") + tleChecksum(l2b)];
  }

  function syntheticFleet() {
    const specs = [
      { name: "ISS (ZARYA)", norad: 25544, inc: 51.64, raan: 80.1, ecc: 0.0004, aop: 95.2, ma: 265, mm: 15.502 },
      { name: "CSS TIANHE", norad: 48274, inc: 41.47, raan: 120.4, ecc: 0.0006, aop: 40, ma: 120, mm: 15.61 },
      { name: "HST", norad: 20580, inc: 28.47, raan: 200.2, ecc: 0.0003, aop: 10, ma: 80, mm: 15.09 },
      { name: "GOES-16", norad: 41866, inc: 0.04, raan: 10, ecc: 0.0002, aop: 0, ma: 75, mm: 1.0027 },
      { name: "GOES-18", norad: 51850, inc: 0.03, raan: 20, ecc: 0.0002, aop: 0, ma: 220, mm: 1.0027 },
      { name: "NOAA 20", norad: 43013, inc: 98.72, raan: 40, ecc: 0.0001, aop: 90, ma: 10, mm: 14.195 },
      { name: "TERRA", norad: 25994, inc: 98.2, raan: 55, ecc: 0.0001, aop: 70, ma: 200, mm: 14.57 },
      { name: "AQUA", norad: 27424, inc: 98.2, raan: 70, ecc: 0.0001, aop: 80, ma: 40, mm: 14.57 },
      { name: "LANDSAT 9", norad: 49260, inc: 98.2, raan: 88, ecc: 0.0001, aop: 90, ma: 300, mm: 14.57 },
      { name: "SENTINEL-2A", norad: 40697, inc: 98.5, raan: 110, ecc: 0.0001, aop: 60, ma: 140, mm: 14.31 },
      { name: "METOP-B", norad: 38771, inc: 98.7, raan: 130, ecc: 0.0001, aop: 50, ma: 20, mm: 14.21 },
      { name: "HIMAWARI-9", norad: 41836, inc: 0.05, raan: 0, ecc: 0.0002, aop: 0, ma: 140.7, mm: 1.0027 },
      { name: "TDRS 13", norad: 42915, inc: 5.2, raan: 40, ecc: 0.0003, aop: 0, ma: 190, mm: 1.0027 },
      { name: "IRIDIUM 180", norad: 43931, inc: 86.4, raan: 15, ecc: 0.0002, aop: 0, ma: 10, mm: 14.34 },
      { name: "IRIDIUM 181", norad: 43932, inc: 86.4, raan: 135, ecc: 0.0002, aop: 0, ma: 130, mm: 14.34 },
      { name: "STARLINK-1007", norad: 44713, inc: 53.05, raan: 0, ecc: 0.0001, aop: 0, ma: 0, mm: 15.06 },
      { name: "STARLINK-1130", norad: 45044, inc: 53.05, raan: 90, ecc: 0.0001, aop: 0, ma: 90, mm: 15.06 },
      { name: "STARLINK-2150", norad: 47974, inc: 53.05, raan: 180, ecc: 0.0001, aop: 0, ma: 180, mm: 15.06 },
      { name: "INTELSAT 39", norad: 44476, inc: 0.02, raan: 0, ecc: 0.0002, aop: 0, ma: 62, mm: 1.0027 },
      { name: "AMC-11", norad: 29644, inc: 0.03, raan: 0, ecc: 0.0002, aop: 0, ma: 229, mm: 1.0027 },
    ];
    for (let i = 0; i < 8; i++) specs.push({ name: "NAVSTAR " + (59 + i), norad: 40730 + i, inc: 55, raan: i * 45, ecc: 0.005, aop: 0, ma: i * 45, mm: 2.0056 });
    const out = [];
    specs.forEach((s) => {
      try {
        const tle = makeTle(s);
        const rec = satlib.twoline2satrec(tle[0], tle[1]);
        out.push(bodyOf(s.name, String(s.norad), rec, true));
      } catch (e) {}
    });
    return out;
  }

  function bodyOf(name, norad, rec, synthetic) {
    return {
      id: norad, name, norad, rec, synthetic,
      lat: 0, lon: 0, alt: 400, vel: 7.6, vx: 0, vy: 0, vz: 0,
      periodMin: rec.no ? (2 * Math.PI) / rec.no : 90,
      inc: rec.inclo ? (rec.inclo * 180) / Math.PI : 0,
      operator: metaOp(name),
      provenance: synthetic ? "SYNTHETIC" : "LIVE",
      kind: "sat",
    };
  }
  function metaOp(name) {
    const n = name.toUpperCase();
    if (n.includes("ISS")) return "NASA / ROSCOSMOS / ESA / JAXA";
    if (n.includes("CSS") || n.includes("TIANHE")) return "CNSA";
    if (n.includes("HST")) return "NASA / ESA";
    if (n.includes("GOES") || n.includes("NOAA")) return "NOAA";
    if (n.includes("STARLINK")) return "SPACEX";
    if (n.includes("SENTINEL") || n.includes("METOP")) return "ESA / EUMETSAT";
    return "UNK";
  }
  function parseTles(text, synthetic) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length - 2; i++) {
      if (!lines[i + 1].startsWith("1 ") || !lines[i + 2].startsWith("2 ")) continue;
      try {
        const rec = satlib.twoline2satrec(lines[i + 1], lines[i + 2]);
        out.push(bodyOf(lines[i].replace(/^0 /, ""), lines[i + 1].slice(2, 7).trim(), rec, synthetic));
      } catch (e) {}
      i += 2;
    }
    return out;
  }
  function propagate(b, date) {
    const pv = satlib.propagate(b.rec, date);
    if (!pv.position || !pv.velocity) return;
    const gd = satlib.eciToGeodetic(pv.position, satlib.gstime(date));
    b.lat = satlib.degreesLat(gd.latitude);
    b.lon = satlib.degreesLong(gd.longitude);
    b.alt = gd.height;
    b.vx = pv.velocity.x; b.vy = pv.velocity.y; b.vz = pv.velocity.z;
    b.vel = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
  }
  function sampleOrbit(b, date, n) {
    n = n || 72;
    const pts = [];
    const periodMs = b.periodMin * 60 * 1000;
    for (let i = 0; i <= n; i++) {
      const d = new Date(date.getTime() + (i / n) * periodMs);
      const pv = satlib.propagate(b.rec, d);
      if (!pv.position) continue;
      const gd = satlib.eciToGeodetic(pv.position, satlib.gstime(d));
      pts.push({ lat: satlib.degreesLat(gd.latitude), lon: satlib.degreesLong(gd.longitude), alt: gd.height });
    }
    return pts;
  }

  async function loadCatalog() {
    try {
      const cached = JSON.parse(localStorage.getItem("exopace-tle-cache") || "null");
      const texts = await Promise.all([
        "stations", "visual", "weather",
      ].map((g) => fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=" + g + "&FORMAT=tle").then((r) => { if (!r.ok) throw new Error(); return r.text(); })));
      const bodies = parseTles(texts.join("\n"), false);
      if (bodies.length > 4) {
        localStorage.setItem("exopace-tle-cache", JSON.stringify({ tle: texts.join("\n"), at: Date.now() }));
        return { bodies: bodies.concat(syntheticFleet().filter((s) => !bodies.some((b) => b.norad === s.norad))), feed: "LIVE" };
      }
      if (cached) return { bodies: parseTles(cached.tle, false), feed: "CACHED" };
    } catch (e) {
      try {
        const cached = JSON.parse(localStorage.getItem("exopace-tle-cache") || "null");
        if (cached) return { bodies: parseTles(cached.tle, false), feed: "CACHED" };
      } catch (e2) {}
    }
    return { bodies: syntheticFleet(), feed: "SYNTHETIC" };
  }

  function Engine(canvas, hooks) {
    this.canvas = canvas;
    this.hooks = hooks || {};
    this.quality = QUALITY[detectQuality()];
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.02, 80);
    this.rig = new MocCamera(this.camera);
    this.rig.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.clock = { mode: "live", rate: 1, epochMs: Date.now(), last: performance.now() };
    this.bodies = [];
    this.feed = "SYNTHETIC";
    this.selectedId = null;
    this.layers = { sats: true, orbits: true, clouds: true, atmo: true, air: true, ships: true, radio: true, labels: true, imagery: true };
    this.meshNodes = [];
    this.air = [];
    this.ships = [];
    this.airProv = "SYNTHETIC";
    this.seaProv = "SYNTHETIC";
    this.imgMode = "satellite";
    this.imgLimited = false;
    this.imgProv = "SYNTHETIC";
    this.sunU = new THREE.Vector3(1, 0.2, 0.2);
    this.tmp = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.running = false;
    this.worker = null;
    this.workerPos = null;
    this.dayBase = null;
  }
  Engine.prototype.tickClock = function () {
    const w = performance.now();
    const dt = (w - this.clock.last) / 1000;
    this.clock.last = w;
    if (this.clock.mode === "live" && this.clock.rate === 1) this.clock.epochMs = Date.now();
    else this.clock.epochMs += dt * 1000 * this.clock.rate;
    return Math.min(0.05, dt);
  };
  Engine.prototype.date = function () { return new Date(this.clock.epochMs); };
  Engine.prototype.rateLabel = function () {
    if (this.clock.mode === "live" && this.clock.rate === 1) return "LIVE";
    if (this.clock.rate === 0) return "HOLD";
    return this.clock.rate + "×";
  };
  Engine.prototype.setRate = function (r) {
    if (r === 1) { this.clock.mode = "live"; this.clock.rate = 1; this.clock.epochMs = Date.now(); }
    else { this.clock.mode = "sim"; this.clock.rate = r; }
  };
  Engine.prototype.setQuality = function (q) {
    if (!QUALITY[q]) return;
    this.quality = QUALITY[q];
    try { localStorage.setItem("exopace-quality", q); } catch (e) {}
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pr));
    if (this.earthU) this.earthU.uClouds.value = this.quality.clouds && this.layers.clouds ? 1 : 0;
    if (this.clouds) this.clouds.visible = this.quality.clouds && this.layers.clouds;
    this.resize();
  };
  Engine.prototype.setLayer = function (id, on) {
    this.layers[id] = on;
    if (id === "clouds" && this.earthU) this.earthU.uClouds.value = on && this.quality.clouds ? 1 : 0;
    if (id === "clouds" && this.clouds) this.clouds.visible = on && this.quality.clouds;
    if (id === "atmo" && this.atmo) this.atmo.visible = on;
    if (id === "radio") this.radioGroup.visible = on;
    if (id === "air" && this.airPts) this.airPts.visible = on;
    if (id === "ships" && this.shipPts) this.shipPts.visible = on;
    if (id === "sats" && this.satPts) this.satPts.visible = on;
  };
  Engine.prototype.setTracks = function (air, ships, airProv, seaProv) {
    this.air = air || [];
    this.ships = ships || [];
    if (airProv) this.airProv = airProv;
    if (seaProv) this.seaProv = seaProv;
    this._syncTracks();
  };
  Engine.prototype.setImagery = function (tex, mode, limited, prov) {
    this.imgMode = mode || this.imgMode;
    this.imgLimited = !!limited;
    this.imgProv = prov || (tex ? "LIVE" : "SYNTHETIC");
    if (!this.earthU) return;
    if (tex) this.earthU.tDay.value = tex;
    else if (this.dayBase) this.earthU.tDay.value = this.dayBase;
  };
  Engine.prototype.applyTle = function (text, provenance) {
    if (text) {
      const bodies = parseTles(text, provenance !== "LIVE");
      if (bodies.length) {
        this.bodies = bodies;
        this.feed = provenance === "LIVE" || provenance === "CACHED" ? provenance : "SYNTHETIC";
        bodies.forEach((b) => { b.provenance = this.feed; });
        this._bootWorker({ });
        this.hooks.onFeed && this.hooks.onFeed({ feed: this.feed, count: this.bodies.length });
        return this.feed;
      }
    }
    this.bodies = syntheticFleet();
    this.feed = "SYNTHETIC";
    this.hooks.onFeed && this.hooks.onFeed({ feed: this.feed, count: this.bodies.length });
    return this.feed;
  };
  Engine.prototype.setMode = function (m) { this.rig.setMode(m); };
  Engine.prototype.setSelected = function (id) { this.selectedId = id; };
  Engine.prototype.selected = function () {
    const id = this.selectedId;
    if (!id) return null;
    const sat = this.bodies.find((b) => b.id === id || b.norad === id || slug(b.name) === slug(id));
    if (sat) return sat;
    return this.air.concat(this.ships).find((t) => t.id === id || slug(t.name) === slug(id)) || null;
  };
  Engine.prototype.find = function (q) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return null;
    const sat = this.bodies.find((b) => b.name.toLowerCase().includes(s) || b.norad === s || b.id.toLowerCase() === s);
    if (sat) return sat;
    return this.air.concat(this.ships).find((t) => (t.name || "").toLowerCase().includes(s) || (t.id || "").toLowerCase() === s) || null;
  };
  Engine.prototype.setMesh = function (nodes) { this.meshNodes = nodes || []; this._syncRadio(); };
  Engine.prototype.recageHome = function () { this.rig.home(); };
  Engine.prototype.recageStation = function () { this.rig.recage(STATION.lat, STATION.lon, 2.4); };
  Engine.prototype.northUp = function () { this.rig.northUp(); };

  Engine.prototype.init = async function () {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: this.quality.id !== "PERF",
      powerPreference: this.quality.id === "PERF" ? "low-power" : "high-performance",
    });
    this.renderer.setClearColor(0x03060b, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.resize();
    await this._earth();
    this._stars();
    this._sats();
    this._trackClouds();
    this.orbitLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7ee0ff, transparent: true, opacity: 0.85 }));
    this.groundLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55 }));
    this.foot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 48), new THREE.MeshBasicMaterial({ color: 0x7ee0ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    this.radioGroup = new THREE.Group();
    this.orbitLine.visible = this.groundLine.visible = this.foot.visible = false;
    this.scene.add(this.orbitLine, this.groundLine, this.foot, this.radioGroup);
    this._bind();
    // Never wait on network: synthetic fleet first so counts are never zero.
    this.bodies = syntheticFleet();
    this.feed = "SYNTHETIC";
    this.air = (g.ExoFeeds ? g.ExoFeeds.synthAir() : []);
    this.ships = (g.ExoFeeds ? g.ExoFeeds.synthSea() : []);
    this._syncTracks();
    this.hooks.onReady && this.hooks.onReady({ feed: this.feed, count: this.bodies.length, webgpu: false, quality: this.quality.id, air: this.air.length, ships: this.ships.length });
    this.running = true;
    this._loop();
    // TLE hydrate is owned by ExoFeeds so SAT badge == globe. Cache only here.
    try {
      const cached = JSON.parse(localStorage.getItem("exopace-tle-cache") || "null");
      if (cached && cached.tle) this.applyTle(cached.tle, "CACHED");
    } catch (e) {}
  };
  Engine.prototype._bootWorker = function (cat) {
    if (typeof Worker === "undefined") return;
    try {
      if (this.worker) this.worker.terminate();
      this.worker = new Worker("/sgp4.worker.js");
      const cached = localStorage.getItem("exopace-tle-cache");
      let tle = "";
      try { tle = cached ? JSON.parse(cached).tle : ""; } catch (e) {}
      this.worker.postMessage({ type: "init", tle: tle || "" });
      const self = this;
      this.worker.onmessage = (ev) => {
        if (ev.data && ev.data.type === "pos") self.workerPos = ev.data;
      };
    } catch (e) { this.worker = null; }
  };

  Engine.prototype._earth = async function () {
    const load = (url, srgb) => new Promise((res) => {
      new THREE.TextureLoader().load(url, (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 4; res(t);
      }, undefined, () => res(null));
    });
    const [day, night, water, clouds] = await Promise.all([
      load("/textures/earth-blue-marble.jpg", true),
      load("/textures/earth-night.jpg", true),
      load("/textures/earth-water.png", false),
      load("/textures/earth-clouds.jpg", true),
    ]);
    const fb = fallbackDay();
    this.dayBase = day || fb;
    this.earthU = {
      tDay: { value: this.dayBase }, tNight: { value: night || fb }, tWater: { value: water || fb },
      tClouds: { value: clouds || fb }, uSun: { value: this.sunU },
      uClouds: { value: this.quality.clouds ? 1 : 0 }, uNightBoost: { value: 2.15 },
    };
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, this.quality.earth, Math.round(this.quality.earth * 0.7)),
      new THREE.ShaderMaterial({ uniforms: this.earthU, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG }),
    ));
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.004, 64, 48),
      new THREE.MeshBasicMaterial({ map: clouds || undefined, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.clouds.visible = this.quality.clouds;
    this.scene.add(this.clouds);
    this.atmoU = { uSun: { value: this.sunU }, uCam: { value: this.camera.position }, uInner: { value: 1 }, uOuter: { value: 1.028 }, uExposure: { value: 1.35 } };
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.028, this.quality.atmo, Math.round(this.quality.atmo * 0.7)),
      new THREE.ShaderMaterial({
        uniforms: this.atmoU, vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
        transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.atmo);
  };

  Engine.prototype._stars = function () {
    const n = this.quality.stars;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const z = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - z * z) * 36;
      pos[i * 3] = Math.cos(t) * rr; pos[i * 3 + 1] = z * 36; pos[i * 3 + 2] = Math.sin(t) * rr;
      const mag = Math.pow(Math.random(), 3.2), c = 0.45 + mag * 0.55, tint = Math.random();
      col[i * 3] = c * (tint > 0.85 ? 1 : tint < 0.1 ? 0.75 : 0.92);
      col[i * 3 + 1] = c * 0.95; col[i * 3 + 2] = c * (tint < 0.12 ? 1 : 0.88);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, sizeAttenuation: true })));
    if (this.quality.milky) {
      const m = 1600, mp = new Float32Array(m * 3), mc = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) {
        const a = (Math.random() - 0.5) * 0.55, b = Math.random() * Math.PI * 2;
        mp[i * 3] = Math.cos(b) * Math.cos(a) * 36;
        mp[i * 3 + 1] = Math.sin(a) * 36 + Math.sin(b * 2) * 2.5;
        mp[i * 3 + 2] = Math.sin(b) * Math.cos(a) * 36;
        const k = 0.18 + Math.random() * 0.16;
        mc[i * 3] = k * 0.9; mc[i * 3 + 1] = k * 0.85; mc[i * 3 + 2] = k;
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
      mg.setAttribute("color", new THREE.BufferAttribute(mc, 3));
      this.scene.add(new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false })));
    }
  };

  Engine.prototype._sats = function () {
    const cap = this.quality.satCap;
    this.satPos = new Float32Array(cap * 3);
    this.satCol = new Float32Array(cap * 3);
    this.satId = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.satPos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.satCol, 3));
    this.satPts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.028, vertexColors: true, sizeAttenuation: true }));
    this.scene.add(this.satPts);
  };

  Engine.prototype._trackClouds = function () {
    const mk = (n, size, hex) => {
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true }));
      this.scene.add(pts);
      return { pos, col, pts, ids: [] };
    };
    this._airCloud = mk(180, 0.022, 0xffb347);
    this._shipCloud = mk(80, 0.024, 0x68e07a);
    this.airPts = this._airCloud.pts;
    this.shipPts = this._shipCloud.pts;
  };

  Engine.prototype._syncTracks = function () {
    this._paintTracks(this._airCloud, this.air, this.layers.air, 0.95, 0.68, 0.28, this.quality.id === "PERF" ? 40 : 140);
    this._paintTracks(this._shipCloud, this.ships, this.layers.ships, 0.40, 0.88, 0.48, this.quality.id === "PERF" ? 20 : 60);
  };

  Engine.prototype._paintTracks = function (cloud, list, vis, cr, cg, cb, cap) {
    if (!cloud) return;
    cloud.pts.visible = !!vis;
    const clustered = this._cluster(list, cap);
    cloud.ids = [];
    const n = clustered.length;
    for (let i = 0; i < n; i++) {
      const t = clustered[i];
      const r = t.kind === "ship" ? 1.004 : 1 + Math.max(t.alt || 8, 0.5) / 6371;
      latLonToVec3(t.lat, t.lon, r, this.tmp);
      cloud.pos[i * 3] = this.tmp.x; cloud.pos[i * 3 + 1] = this.tmp.y; cloud.pos[i * 3 + 2] = this.tmp.z;
      const sel = this.selectedId && this.selectedId === t.id;
      cloud.col[i * 3] = sel ? 1 : cr;
      cloud.col[i * 3 + 1] = sel ? 0.88 : cg;
      cloud.col[i * 3 + 2] = sel ? 0.4 : cb;
      cloud.ids.push(t.id);
    }
    cloud.pts.geometry.attributes.position.needsUpdate = true;
    cloud.pts.geometry.attributes.color.needsUpdate = true;
    cloud.pts.geometry.setDrawRange(0, n);
  };

  Engine.prototype._cluster = function (list, cap) {
    if (!list || !list.length) return [];
    const far = this.rig && this.rig.sph.r > 5;
    if (!far || list.length <= cap) return list.slice(0, cap);
    const bins = {};
    const step = 8;
    list.forEach((t) => {
      const k = Math.round(t.lat / step) + ":" + Math.round(t.lon / step);
      if (!bins[k]) bins[k] = { ...t, name: t.name, n: 1 };
      else bins[k].n++;
    });
    return Object.keys(bins).slice(0, cap).map((k) => {
      const b = bins[k];
      if (b.n > 1) b.name = b.n + " · cluster";
      return b;
    });
  };

  Engine.prototype._bind = function () {
    const el = this.canvas, self = this;
    el.addEventListener("pointerdown", (e) => { self.drag = { x: e.clientX, y: e.clientY, moved: false }; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (!self.drag) return;
      const dx = e.clientX - self.drag.x, dy = e.clientY - self.drag.y;
      if (Math.hypot(dx, dy) > 3) self.drag.moved = true;
      self.drag.x = e.clientX; self.drag.y = e.clientY;
      self.rig.orbit(dx * 0.005, dy * 0.005);
    });
    el.addEventListener("pointerup", (e) => {
      const d = self.drag; self.drag = null;
      if (d && !d.moved) self._pick(e.clientX, e.clientY);
    });
    el.addEventListener("wheel", (e) => { e.preventDefault(); self.rig.dolly(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    addEventListener("resize", () => self.resize());
  };

  Engine.prototype._pick = function (cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    let best = null;
    const consider = (ids, pos) => {
      for (let i = 0; i < ids.length; i++) {
        this.tmp.fromArray(pos, i * 3);
        const to = this.tmp.clone().sub(ray.ray.origin);
        const t = to.dot(ray.ray.direction);
        if (t < 0) continue;
        const dist = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t).distanceTo(this.tmp);
        const thresh = 0.035 + this.tmp.distanceTo(this.camera.position) * 0.012;
        if (dist < thresh && (!best || dist < best.d)) best = { id: ids[i], d: dist };
      }
    };
    consider(this.satId, this.satPos);
    if (this._airCloud) consider(this._airCloud.ids, this._airCloud.pos);
    if (this._shipCloud) consider(this._shipCloud.ids, this._shipCloud.pos);
    this.hooks.onPick && this.hooks.onPick(best ? best.id : null);
  };

  Engine.prototype.resize = function () {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(8, r.width | 0), h = Math.max(8, r.height | 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  Engine.prototype._loop = function () {
    const self = this;
    const step = () => {
      if (!self.running) return;
      requestAnimationFrame(step);
      const dt = self.tickClock();
      const date = self.date();
      sunDir(date, self.sunU);
      if (self.atmoU) self.atmoU.uCam.value.copy(self.camera.position);
      if (self.clouds && !self.rig.reduced) self.clouds.rotation.y += dt * 0.0025 * Math.max(self.clock.rate, 0.15);
      const cap = Math.min(self.bodies.length, self.quality.satCap);
      const wall = performance.now();
      if (self.worker && (!self._wTick || wall - self._wTick > 280)) {
        self._wTick = wall;
        try { self.worker.postMessage({ type: "tick", epoch: date.getTime(), cap }); } catch (e) {}
      }
      self.satId = [];
      const useW = self.workerPos && self.workerPos.pos && self.workerPos.pos.length >= 3;
      for (let i = 0; i < cap; i++) {
        const b = self.bodies[i];
        if (useW && self.workerPos.pos[i * 3] != null) {
          self.satPos[i * 3] = self.workerPos.pos[i * 3];
          self.satPos[i * 3 + 1] = self.workerPos.pos[i * 3 + 1];
          self.satPos[i * 3 + 2] = self.workerPos.pos[i * 3 + 2];
          const m = self.workerPos.meta && self.workerPos.meta[i];
          if (m) { b.lat = m.lat; b.lon = m.lon; b.alt = m.alt; }
        } else {
          propagate(b, date);
          const r = 1 + Math.max(b.alt, 80) / EARTH_R_KM;
          latLonToVec3(b.lat, b.lon, r, self.tmp);
          self.satPos[i * 3] = self.tmp.x; self.satPos[i * 3 + 1] = self.tmp.y; self.satPos[i * 3 + 2] = self.tmp.z;
        }
        const sel = self.selectedId && (b.id === self.selectedId || b.norad === self.selectedId);
        self.satCol[i * 3] = sel ? 1 : 0.49;
        self.satCol[i * 3 + 1] = sel ? 0.88 : 0.88;
        self.satCol[i * 3 + 2] = sel ? 0.54 : 1;
        self.satId.push(b.id);
      }
      self.satPts.geometry.attributes.position.needsUpdate = true;
      self.satPts.geometry.attributes.color.needsUpdate = true;
      self.satPts.geometry.setDrawRange(0, cap);
      self.satPts.visible = self.layers.sats;
      if (!self._trTick || wall - self._trTick > 400) {
        self._trTick = wall;
        if (self.airProv === "SYNTHETIC" && g.ExoFeeds) self.air = g.ExoFeeds.synthAir(date.getTime());
        if (self.seaProv === "SYNTHETIC" && g.ExoFeeds) self.ships = g.ExoFeeds.synthSea(date.getTime());
        self._syncTracks();
      }
      const sel = self.selected();
      let selPos = null;
      if (sel) {
        selPos = latLonToVec3(sel.lat, sel.lon, 1 + Math.max(sel.alt, 80) / EARTH_R_KM);
        self.vel.set(sel.vx, sel.vz, -sel.vy).normalize();
      }
      self.rig.tick(dt, selPos, self.vel);
      if (sel && self.layers.orbits) self._selGeom(sel, date);
      else { self.orbitLine.visible = self.groundLine.visible = self.foot.visible = false; }
      self.renderer.render(self.scene, self.camera);
      self.hooks.onTick && self.hooks.onTick({
        date, rateLabel: self.rateLabel(), selected: sel,
        nextEvent: sel ? nextAos(sel) : "NO LOCK",
        counts: { sat: cap, radio: self.meshNodes.length, air: self.air.length, ships: self.ships.length },
        provenance: { sat: self.feed, air: self.airProv, sea: self.seaProv, imagery: self.imgProv || "SYNTHETIC" },
        cam: self.rig.mode,
      });
    };
    step();
  };

  Engine.prototype._selGeom = function (b, date) {
    if (!b || !b.rec) { this.orbitLine.visible = this.groundLine.visible = false; return; }
    const pts = sampleOrbit(b, date, this.quality.id === "PERF" ? 48 : 80);
    if (pts.length < 4) return;
    const o = [], gnd = [], v = new THREE.Vector3();
    pts.forEach((p) => {
      latLonToVec3(p.lat, p.lon, 1 + Math.max(p.alt, 80) / EARTH_R_KM, v); o.push(v.x, v.y, v.z);
      latLonToVec3(p.lat, p.lon, 1.004, v); gnd.push(v.x, v.y, v.z);
    });
    this.orbitLine.geometry.dispose();
    this.orbitLine.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(o, 3));
    this.groundLine.geometry.dispose();
    this.groundLine.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gnd, 3));
    this.orbitLine.visible = this.groundLine.visible = true;
    const h = Math.max(b.alt, 80) / EARTH_R_KM;
    const ang = Math.acos(1 / (1 + h));
    this.foot.scale.setScalar(Math.sin(ang) * 0.98);
    latLonToVec3(b.lat, b.lon, 1.006, this.tmp);
    this.foot.position.copy(this.tmp); this.foot.lookAt(0, 0, 0); this.foot.visible = true;
  };

  Engine.prototype._syncRadio = function () {
    while (this.radioGroup.children.length) {
      const ch = this.radioGroup.children[0];
      this.radioGroup.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
    }
    if (!this.layers.radio) return;
    this.meshNodes.forEach((n) => {
      if (n.lat == null) return;
      const p = latLonToVec3(n.lat, n.lon, 1.012);
      const color = n.kind === "sos" ? 0xff5c5c : n.kind === "me" ? 0xffe08a : n.kind === "way" ? 0x9fd356 : 0x7ee0ff;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(n.kind === "me" ? 0.016 : 0.012, 10, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 + 0.75 * (n.conf == null ? 1 : n.conf), toneMapped: false }),
      );
      mesh.position.copy(p);
      this.radioGroup.add(mesh);
    });
  };

  function nextAos(b) {
    if (b.kind === "air") return (b.provenance || "SYNTHETIC") + " · ADS-B TRACK";
    if (b.kind === "ship") return (b.provenance || "SYNTHETIC") + " · AIS TRACK";
    const sat = latLonToVec3(b.lat, b.lon, 1 + Math.max(b.alt, 80) / EARTH_R_KM);
    const gs = latLonToVec3(STATION.lat, STATION.lon, 1);
    const look = sat.clone().sub(gs).normalize();
    const el = Math.asin(THREE.MathUtils.clamp(look.dot(gs.clone().normalize()), -1, 1)) / DEG;
    if (el > 10) return "AOS NOW · " + el.toFixed(0) + "° EL · MILLINGTON";
    return "NEXT PASS · MILLINGTON";
  }
  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function fallbackDay() {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
    const g = c.getContext("2d"); g.fillStyle = "#0b3a62"; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = "#2a6b3a";
    [[180, 200, 90], [520, 180, 110], [780, 240, 70]].forEach((p) => { g.beginPath(); g.ellipse(p[0], p[1], p[2], p[2] * 0.55, 0, 0, 7); g.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  g.ExoEngine = Engine;
  g.ExoQuality = QUALITY;
  g.detectQuality = detectQuality;
})(window);
