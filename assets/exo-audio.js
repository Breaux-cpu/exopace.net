/* Acoustic waterfall, spectrum, and CW / DTMF / AFSK tone log. Audio stays on this device. */
(function (root) {
  var ctx = null;
  var analyser = null;
  var stream = null;
  var worklet = null;
  var raf = 0;
  var running = false;
  var host = null;
  var peaks = null;
  var img = null;
  var gl = null;
  var tex = null;
  var W = 640;
  var H = 180;
  var logLines = [];

  function css() {
    if (document.getElementById("exo-audio-css")) return;
    var style = document.createElement("style");
    style.id = "exo-audio-css";
    style.textContent = ""
      + ".exo-au,.exo-au *{box-sizing:border-box}"
      + ".exo-au{max-width:100%;min-width:0;margin-top:10px}"
      + ".exo-au canvas{width:100%;max-width:100%;height:auto;display:block;background:#04070D;border:1px solid rgba(126,224,255,.28);border-radius:12px}"
      + ".exo-au__row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}"
      + ".exo-au select,.exo-au input,.exo-au button{min-height:44px;max-width:100%;background:#04070D;color:#7EE0FF;border:1px solid rgba(126,224,255,.4);border-radius:10px;padding:0 10px;font:14px \"IBM Plex Mono\",ui-monospace,monospace}"
      + ".exo-au button{letter-spacing:.06em;cursor:pointer}"
      + ".exo-au__num{font-variant-numeric:tabular-nums;font-feature-settings:\"tnum\" 1;color:#FFB84D}"
      + ".exo-au__log{max-height:160px;overflow:auto;margin:8px 0 0;padding:8px;background:rgba(4,7,13,.72);border:1px solid rgba(126,224,255,.22);border-radius:12px;backdrop-filter:blur(16px);color:#e7f4ef;font:12px/1.45 \"IBM Plex Mono\",ui-monospace,monospace}"
      + ".exo-au__log b{color:#FFB84D;font-weight:600}";
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function pushLog(kind, text) {
    var line = new Date().toISOString().slice(11, 19) + "Z  " + kind + "  " + text;
    logLines.unshift(line);
    logLines = logLines.slice(0, 40);
    var el = host && host.querySelector("[data-log]");
    if (el) el.innerHTML = logLines.map(function (row) { return "<div><b>" + esc(row.slice(0, 9)) + "</b> " + esc(row.slice(10)) + "</div>"; }).join("");
  }

  function color(t) {
    if (t < 0.55) {
      var u = t / 0.55;
      return [4 + u * 122, 7 + u * 217, 13 + u * 242];
    }
    var v = (t - 0.55) / 0.45;
    return [126 + v * 129, 224 + v * (184 - 224), 255 + v * (77 - 255)];
  }

  function shell() {
    host.innerHTML = ''
      + '<div class="exo-au">'
      + '<div class="exo-au__row"><select data-dev aria-label="Audio input"><option value="">Default input</option></select>'
      + '<button type="button" data-act="arm">ARM</button><button type="button" data-act="stop" disabled>STOP</button></div>'
      + '<div class="exo-au__row"><label class="exo-au__num">FLOOR <input data-floor type="range" min="-120" max="-30" value="-90" aria-label="dB floor"></label>'
      + '<span data-floor-n class="exo-au__num">-90 dB</span>'
      + '<label class="exo-au__num">CW <input data-cw type="number" min="200" max="3000" value="700" aria-label="CW tone Hz"> Hz</label></div>'
      + '<canvas data-spec width="640" height="140"></canvas>'
      + '<canvas data-fall width="640" height="180" style="margin-top:8px"></canvas>'
      + '<div class="exo-au__log" data-log><div>ARM a mic, line-in, or USB radio. Decode log stays on this device.</div></div>'
      + '</div>';
    host.querySelector("[data-floor]").addEventListener("input", function (event) {
      host.querySelector("[data-floor-n]").textContent = event.target.value + " dB";
      applyFloor();
    });
    host.addEventListener("click", function (event) {
      var btn = event.target.closest("button");
      if (!btn) return;
      if (btn.getAttribute("data-act") === "arm") start().catch(function (err) {
        pushLog("AUDIO", err && err.name === "NotAllowedError" ? "PERMISSION DENIED" : "INPUT UNAVAILABLE");
      });
      if (btn.getAttribute("data-act") === "stop") { stop(); pushLog("AUDIO", "STOPPED"); }
    });
  }

  function applyFloor() {
    if (!analyser || !host) return;
    var floor = Number(host.querySelector("[data-floor]").value);
    analyser.minDecibels = floor;
    analyser.maxDecibels = Math.min(-10, floor + 70);
  }

  function devices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve([]);
    return navigator.mediaDevices.enumerateDevices().then(function (list) {
      return list.filter(function (item) { return item.kind === "audioinput"; });
    }).catch(function () { return []; });
  }

  function fillDevices() {
    var sel = host.querySelector("[data-dev]");
    var current = sel.value;
    return devices().then(function (list) {
      sel.innerHTML = '<option value="">Default input</option>' + list.map(function (item, i) {
        var label = item.label || ("Input " + (i + 1));
        return '<option value="' + esc(item.deviceId) + '">' + esc(label) + "</option>";
      }).join("");
      if (current) sel.value = current;
    });
  }

  function workletSource() {
    return "class ExoEars extends AudioWorkletProcessor {"
      + "constructor(){super();this.cwOn=false;this.cwN=0;this.dit=sampleRate*0.08;this.letter='';this.word='';"
      + "this.mark=0;this.space=0;this.bitN=0;this.bit=0;this.afsk='';this.lastTone='';this.dtmf='';this.dtmfN=0;this.dtmfSent=false;"
      + "this.lows=[697,770,852,941];this.highs=[1209,1336,1477,1633];"
      + "this.keys=['1','2','3','A','4','5','6','B','7','8','9','C','*','0','#','D'];}"
      + "goertzel(ch,freq){var n=ch.length;var k=Math.round(freq*n/sampleRate);var w=2*Math.PI*k/n;var c=2*Math.cos(w);var s0=0,s1=0,s2=0;"
      + "for(var i=0;i<n;i++){s0=ch[i]+c*s1-s2;s2=s1;s1=s0;}return s1*s1+s2*s2-c*s1*s2;}"
      + "process(inputs){var ch=inputs[0]&&inputs[0][0];if(!ch||!ch.length)return true;"
      + "var tone=700;var mag=this.goertzel(ch,tone);var on=mag>0.4;"
      + "if(on){this.cwN+=ch.length;this.cwOn=true;}else if(this.cwOn){"
      + "var units=this.cwN/this.dit;this.letter+=units<2?'.':'-';if(units>0.4&&units<8)this.dit=this.dit*0.8+this.cwN*(units<2?1:1/3)*0.2;"
      + "this.cwOn=false;this.cwN=0;}else{this.cwN+=ch.length;if(this.letter&&this.cwN>this.dit*2.2){"
      + "var map={'.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z'};"
      + "this.port.postMessage({kind:'CW',text:map[this.letter]||'?'});this.letter='';this.cwN=0;}}"
      + "var m=this.goertzel(ch,1200),s=this.goertzel(ch,2200);var toneName=m>s*1.3?'MARK':s>m*1.3?'SPACE':'';"
      + "if(toneName&&toneName!==this.lastTone){this.lastTone=toneName;this.port.postMessage({kind:'AFSK',text:toneName});}"
      + "var bestL=0,bestH=0,li=0,hi=0;for(var a=0;a<4;a++){var gl=this.goertzel(ch,this.lows[a]);if(gl>bestL){bestL=gl;li=a;}}"
      + "for(var b=0;b<4;b++){var gh=this.goertzel(ch,this.highs[b]);if(gh>bestH){bestH=gh;hi=b;}}"
      + "var digit=bestL>0.2&&bestH>0.2?this.keys[li*4+hi]:'';"
      + "if(digit&&digit===this.dtmf){this.dtmfN+=ch.length;if(!this.dtmfSent&&this.dtmfN>sampleRate*0.05){this.dtmfSent=true;this.port.postMessage({kind:'DTMF',text:digit});}}"
      + "else{this.dtmf=digit;this.dtmfN=0;this.dtmfSent=false;}return true;}}"
      + "registerProcessor('exo-ears', ExoEars);";
  }

  function attachWorklet(source) {
    var blob = new Blob([workletSource()], { type: "application/javascript" });
    var url = URL.createObjectURL(blob);
    return ctx.audioWorklet.addModule(url).then(function () {
      URL.revokeObjectURL(url);
      worklet = new AudioWorkletNode(ctx, "exo-ears");
      source.connect(worklet);
      var lastAfsk = 0;
      worklet.port.onmessage = function (event) {
        var msg = event.data || {};
        if (!msg.text) return;
        if (msg.kind === "AFSK") {
          var now = Date.now();
          if (now - lastAfsk < 250) return;
          lastAfsk = now;
        }
        pushLog(msg.kind || "TONE", msg.text);
        if (msg.kind === "CW" || msg.kind === "DTMF") {
          root.dispatchEvent(new CustomEvent("exo-observe", { detail: { source: "AUDIO", kind: String(msg.kind).toLowerCase(), value: msg.text } }));
        }
      };
    }).catch(function () {
      URL.revokeObjectURL(url);
      pushLog("AUDIO", "TONE WORKLET IDLE — SPECTRUM STILL LIVE");
    });
  }

  function setupGL(canvas) {
    gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: false });
    if (!gl) return false;
    function shader(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl = null; return null; }
      return sh;
    }
    var vs = shader(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*0.5+0.5,0.5-p.y*0.5);gl_Position=vec4(p,0.0,1.0);}");
    var fs = shader(gl.FRAGMENT_SHADER, "precision mediump float;varying vec2 uv;uniform sampler2D tex;void main(){gl_FragColor=texture2D(tex,uv);}");
    if (!vs || !fs) return false;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return false; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return true;
  }

  function draw() {
    if (!running || !analyser) return;
    raf = root.requestAnimationFrame(draw);
    var bins = analyser.frequencyBinCount;
    var freq = new Uint8Array(bins);
    analyser.getByteFrequencyData(freq);
    if (!peaks || peaks.length !== bins) peaks = new Float32Array(bins);
    var spec = host.querySelector("[data-spec]");
    var fall = host.querySelector("[data-fall]");
    var sctx = spec.getContext("2d");
    var width = spec.width;
    var height = spec.height;
    sctx.fillStyle = "#04070D";
    sctx.fillRect(0, 0, width, height);
    sctx.beginPath();
    var step = Math.max(1, Math.floor(bins / width));
    for (var x = 0; x < width; x++) {
      var mag = freq[Math.min(bins - 1, x * step)];
      var pk = peaks[Math.min(bins - 1, x * step)];
      if (mag > pk) peaks[x * step] = mag;
      else peaks[x * step] = Math.max(0, pk - 0.7);
      var y = height - (mag / 255) * (height - 8) - 4;
      if (x === 0) sctx.moveTo(x, y);
      else sctx.lineTo(x, y);
    }
    sctx.strokeStyle = "#7EE0FF";
    sctx.lineWidth = 1.5;
    sctx.stroke();
    sctx.beginPath();
    for (var px = 0; px < width; px++) {
      var peak = peaks[Math.min(bins - 1, px * step)] || 0;
      var py = height - (peak / 255) * (height - 8) - 4;
      if (px === 0) sctx.moveTo(px, py);
      else sctx.lineTo(px, py);
    }
    sctx.strokeStyle = "#FFB84D";
    sctx.stroke();
    if (!img) img = new Uint8ClampedArray(W * H * 4);
    img.copyWithin(W * 4, 0, (H - 1) * W * 4);
    for (var col = 0; col < W; col++) {
      var sample = freq[Math.min(bins - 1, Math.floor(col * bins / W))] / 255;
      var rgb = color(sample);
      var o = col * 4;
      img[o] = rgb[0];
      img[o + 1] = rgb[1];
      img[o + 2] = rgb[2];
      img[o + 3] = 255;
    }
    if (gl && tex) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      var fctx = fall.getContext("2d");
      var image = new ImageData(img, W, H);
      fctx.putImageData(image, 0, 0);
    }
  }

  function start() {
    stop();
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      pushLog("AUDIO", "THIS BROWSER HAS NO AUDIO INPUT");
      return Promise.resolve();
    }
    var deviceId = host.querySelector("[data-dev]").value;
    var audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({ audio: audio }).then(function (media) {
      stream = media;
      ctx = new AC();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.0;
      applyFloor();
      var source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      running = true;
      var fall = host.querySelector("[data-fall]");
      if (!setupGL(fall)) gl = null;
      draw();
      return fillDevices().then(function () { return attachWorklet(source); }).then(function () {
        var tone = Number(host.querySelector("[data-cw]").value) || 700;
        if (worklet) worklet.port.postMessage({ cw: tone });
        pushLog("AUDIO", "LIVE");
        stopBtn(true);
      });
    });
  }

  /* STOP only does something while an input is live. */
  function stopBtn(on) {
    var b = host && host.querySelector('[data-act="stop"]');
    if (b) b.disabled = !on;
  }

  function stop() {
    running = false;
    stopBtn(false);
    if (raf) root.cancelAnimationFrame(raf);
    raf = 0;
    if (worklet) { worklet.disconnect(); worklet = null; }
    if (ctx) { ctx.close(); ctx = null; }
    analyser = null;
    gl = null;
    tex = null;
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
  }

  function mount(el) {
    host = el;
    css();
    shell();
    fillDevices();
  }

  function boot() {
    var el = document.getElementById("exo-audio");
    if (!el || el.dataset.exoAudio) return;
    el.dataset.exoAudio = "1";
    mount(el);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  root.EXO_AUDIO = { mount: mount, stop: stop };
})(typeof globalThis !== "undefined" ? globalThis : window);
