/* Direct WebUSB driver for RTL2832U + R820T/R828D. No spectrum is drawn until a dongle streams IQ. */
(function (root) {
  var VENDOR = 0x0bda;
  var PRODUCTS = [0x2838, 0x2832];
  var XTAL = 28800000;
  var IF_HZ = 3570000;
  var MIN_HZ = 24000000;
  var MAX_HZ = 1766000000;
  var RATE = 2048000;
  var IDLE = "No receiver connected. Plug in a USB SDR, then press Connect USB SDR.";
  var NO_USB = "This browser can't open USB devices. Use Chrome or Edge on a computer or an Android phone. Without a receiver you can still use the Audio input decoder and Passes.";
  function openHelp(err) {
    var name = err && err.name;
    if (name === "SecurityError") return "The browser blocked USB access here. Allow USB devices for this site in the browser's site settings, then press Connect USB SDR again.";
    return "Couldn't open the receiver. Close any other SDR app using it, unplug and replug it, then press Connect USB SDR. On Windows the dongle needs the WinUSB driver (install it once with Zadig)." + (err && err.message ? " Detail: " + err.message : "");
  }
  var GAINS = [0, 9, 14, 27, 37, 77, 87, 125, 144, 157, 166, 197, 207, 229, 254, 280, 297, 328, 338, 364, 372, 386, 402, 421, 434, 439, 445, 480, 496];
  var INIT = [
    0x83, 0x32, 0x75, 0xc0, 0x40, 0xd6, 0x6c, 0xf5, 0x63, 0x75, 0x68,
    0x6c, 0x83, 0x80, 0x00, 0x0f, 0x00, 0xc0, 0x30, 0x48, 0xcc, 0x60,
    0x00, 0x54, 0xae, 0x4a, 0xc0
  ];
  var BANDS = [
    [0, 0x08, 0x02, 0xdf, 0x00], [50, 0x08, 0x02, 0xbe, 0x00], [55, 0x08, 0x02, 0x8b, 0x00],
    [60, 0x08, 0x02, 0x7b, 0x00], [65, 0x08, 0x02, 0x69, 0x00], [70, 0x08, 0x02, 0x58, 0x00],
    [75, 0x00, 0x02, 0x44, 0x00], [90, 0x00, 0x02, 0x34, 0x00], [110, 0x00, 0x02, 0x24, 0x00],
    [140, 0x00, 0x02, 0x14, 0x00], [180, 0x00, 0x02, 0x13, 0x00], [250, 0x00, 0x02, 0x11, 0x00],
    [280, 0x00, 0x02, 0x00, 0x00], [310, 0x00, 0x41, 0x00, 0x00], [588, 0x00, 0x40, 0x00, 0x00]
  ];
  var FIR = [-54, -36, -41, -40, -32, -14, 14, 53, 101, 156, 215, 273, 327, 372, 404, 421];
  var LP = [1700000, 1600000, 1550000, 1450000, 1200000, 900000, 700000, 550000, 450000, 350000];

  var device = null;
  var worker = null;
  var running = false;
  var i2cAddr = 0x34;
  var chip = "R820T";
  var shadow = new Uint8Array(30);
  var intFreq = IF_HZ;
  var hasLock = false;
  var freqHz = 162550000;
  var mode = "FM";
  var gainTenth = null;
  var audio = null;
  var proc = null;
  var pcm = new Float32Array(48000);
  var pcmRead = 0;
  var pcmWrite = 0;
  var latest = null;
  var dirty = false;
  var raf = 0;
  var scriptSrc = (typeof document !== "undefined" && document.currentScript) ? document.currentScript.src : "";

  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function sampleRatio(xtal, rate) {
    var ratio = Math.floor((xtal * 4194304) / rate);
    return (ratio & 0x0ffffffc) >>> 0;
  }

  function rateAllowed(rate) {
    return rate > 225000 && rate <= 3200000 && !(rate > 300000 && rate <= 900000);
  }

  function bitrev(b) {
    b = ((b & 0xf0) >> 4) | ((b & 0x0f) << 4);
    b = ((b & 0xcc) >> 2) | ((b & 0x33) << 2);
    b = ((b & 0xaa) >> 1) | ((b & 0x55) << 1);
    return b & 0xff;
  }

  function paint(text) {
    if (typeof document === "undefined") return;
    var nodes = document.querySelectorAll(".exo-usb-status");
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
  }

  function fallback(text) {
    if (typeof document === "undefined") return;
    var nodes = document.querySelectorAll(".exo-usb-fallback");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].hidden = !text;
      nodes[i].textContent = text || "";
    }
  }

  async function ctrlOut(value, index, bytes) {
    var res = await device.controlTransferOut({
      requestType: "vendor", recipient: "device", request: 0, value: value, index: index
    }, bytes);
    if (res.status !== "ok") throw new Error("USB control out failed");
    return res.bytesWritten;
  }

  async function ctrlIn(value, index, len) {
    var res = await device.controlTransferIn({
      requestType: "vendor", recipient: "device", request: 0, value: value, index: index
    }, len);
    if (res.status !== "ok" || !res.data) throw new Error("USB control in failed");
    return new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength);
  }

  async function writeReg(block, addr, val, len) {
    var data = new Uint8Array(len);
    if (len === 1) data[0] = val & 0xff;
    else { data[0] = (val >> 8) & 0xff; data[1] = val & 0xff; }
    await ctrlOut(addr, (block << 8) | 0x10, data);
  }

  async function demodWrite(page, addr, val, len) {
    var data = new Uint8Array(len);
    if (len === 1) data[0] = val & 0xff;
    else { data[0] = (val >> 8) & 0xff; data[1] = val & 0xff; }
    await ctrlOut((addr << 8) | 0x20, 0x10 | page, data);
    await ctrlIn((0x01 << 8) | 0x20, 0x0a, 1);
  }

  async function i2cWrite(bytes) {
    await ctrlOut(i2cAddr, (6 << 8) | 0x10, bytes);
  }

  async function i2cReadReg(addr, reg) {
    await ctrlOut(addr, (6 << 8) | 0x10, new Uint8Array([reg]));
    var data = await ctrlIn(addr, 6 << 8, 1);
    return data[0];
  }

  async function r82Read(reg, len) {
    await i2cWrite(new Uint8Array([reg]));
    var raw = await ctrlIn(i2cAddr, 6 << 8, len);
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = bitrev(raw[i]);
    return out;
  }

  async function r82Write(reg, bytes) {
    var src = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    for (var i = 0; i < src.length; i++) {
      var idx = reg + i - 5;
      if (idx >= 0 && idx < shadow.length) shadow[idx] = src[i];
    }
    var pos = 0;
    var at = reg;
    while (pos < src.length) {
      var size = Math.min(7, src.length - pos);
      var buf = new Uint8Array(size + 1);
      buf[0] = at;
      buf.set(src.subarray(pos, pos + size), 1);
      await i2cWrite(buf);
      at += size;
      pos += size;
    }
  }

  async function r82Mask(reg, val, bits) {
    var idx = reg - 5;
    var next = (shadow[idx] & ~bits) | (val & bits);
    shadow[idx] = next;
    await r82Write(reg, new Uint8Array([next]));
  }

  async function repeater(on) {
    await demodWrite(1, 0x01, on ? 0x18 : 0x10, 1);
  }

  async function writeFir() {
    var fir = new Uint8Array(20);
    for (var i = 0; i < 8; i++) fir[i] = FIR[i] & 0xff;
    for (var p = 0; p < 8; p += 2) {
      var val0 = FIR[8 + p];
      var val1 = FIR[8 + p + 1];
      fir[8 + (p * 3) / 2] = (val0 >> 4) & 0xff;
      fir[8 + (p * 3) / 2 + 1] = ((val0 << 4) | ((val1 >> 8) & 0x0f)) & 0xff;
      fir[8 + (p * 3) / 2 + 2] = val1 & 0xff;
    }
    for (var n = 0; n < fir.length; n++) await demodWrite(1, 0x1c + n, fir[n], 1);
  }

  async function initBaseband() {
    await writeReg(1, 0x2000, 0x09, 1);
    await writeReg(1, 0x2158, 0x0002, 2);
    await writeReg(1, 0x2148, 0x1002, 2);
    await writeReg(2, 0x300b, 0x22, 1);
    await writeReg(2, 0x3000, 0xe8, 1);
    await demodWrite(1, 0x01, 0x14, 1);
    await demodWrite(1, 0x01, 0x10, 1);
    await demodWrite(1, 0x15, 0x00, 1);
    await demodWrite(1, 0x16, 0x0000, 2);
    for (var i = 0; i < 6; i++) await demodWrite(1, 0x16 + i, 0x00, 1);
    await writeFir();
    await demodWrite(0, 0x19, 0x05, 1);
    await demodWrite(1, 0x93, 0xf0, 1);
    await demodWrite(1, 0x94, 0x0f, 1);
    await demodWrite(1, 0x11, 0x00, 1);
    await demodWrite(1, 0x04, 0x00, 1);
    await demodWrite(0, 0x61, 0x60, 1);
    await demodWrite(0, 0x06, 0x80, 1);
    await demodWrite(1, 0xb1, 0x1b, 1);
    await demodWrite(0, 0x0d, 0x83, 1);
  }

  async function setIf(freq) {
    var scaled = Math.floor((freq * 4194304) / XTAL);
    var ifFreq = (-scaled) | 0;
    await demodWrite(1, 0x19, (ifFreq >> 16) & 0x3f, 1);
    await demodWrite(1, 0x1a, (ifFreq >> 8) & 0xff, 1);
    await demodWrite(1, 0x1b, ifFreq & 0xff, 1);
  }

  async function setPll(freq) {
    var freqKhz = Math.floor((freq + 500) / 1000);
    var mixDiv = 2;
    var divNum = 0;
    while (mixDiv <= 128) {
      var span = freqKhz * mixDiv;
      if (span >= 1770000 && span < 3540000) {
        var buf = mixDiv;
        divNum = 0;
        while (buf > 2) { buf >>= 1; divNum++; }
        break;
      }
      mixDiv <<= 1;
    }
    await r82Mask(0x1a, 0x00, 0x0c);
    var data = await r82Read(0x00, 5);
    var vcoPowerRef = chip === "R828D" ? 1 : 2;
    var fine = (data[4] & 0x30) >> 4;
    if (fine > vcoPowerRef) divNum -= 1;
    else if (fine < vcoPowerRef) divNum += 1;
    var regs = shadow.slice(0x10 - 5, 0x17 - 5);
    regs[0] = (regs[0] & ~0x10);
    regs[2] = (regs[2] & ~0xe0) | 0x80;
    regs[0] = (regs[0] & ~0xe0) | ((divNum << 5) & 0xe0);
    var vcoDiv = Math.floor((XTAL + 65536 * freq * mixDiv) / (2 * XTAL));
    var nint = Math.floor(vcoDiv / 65536);
    var sdm = vcoDiv % 65536;
    if (nint > (128 / vcoPowerRef) - 1) throw new Error("Tuner PLL has no value for this frequency");
    var ni = Math.floor((nint - 13) / 4);
    var si = nint - 4 * ni - 13;
    regs[4] = (ni + (si << 6)) & 0xff;
    regs[2] = (regs[2] & ~0x08) | (sdm === 0 ? 0x08 : 0x00);
    regs[5] = sdm & 0xff;
    regs[6] = (sdm >> 8) & 0xff;
    await r82Write(0x10, regs);
    hasLock = false;
    for (var attempt = 0; attempt < 2; attempt++) {
      await delay(8);
      var st = await r82Read(0x00, 3);
      if (st[2] & 0x40) { hasLock = true; break; }
      if (attempt === 0) await r82Mask(0x12, 0x60, 0xe0);
    }
    if (hasLock) await r82Mask(0x1a, 0x08, 0x08);
    return hasLock;
  }

  async function setMux(loHz) {
    var mhz = loHz / 1000000;
    var index = BANDS.length - 1;
    for (var i = 0; i < BANDS.length - 1; i++) {
      if (mhz < BANDS[i + 1][0]) { index = i; break; }
    }
    var range = BANDS[index];
    await r82Mask(0x17, range[1], 0x08);
    await r82Mask(0x1a, range[2], 0xc3);
    await r82Write(0x1b, new Uint8Array([range[3]]));
    await r82Mask(0x10, range[4], 0x0b);
    await r82Mask(0x08, 0x00, 0x3f);
    await r82Mask(0x09, 0x00, 0x3f);
  }

  async function setBandwidth(bw) {
    var regA;
    var regB;
    if (bw > 7000000) { regA = 0x10; regB = 0x0b; intFreq = 4570000; }
    else if (bw > 6000000) { regA = 0x10; regB = 0x2a; intFreq = 4570000; }
    else if (bw > LP[0] + 350000 + 380000) { regA = 0x10; regB = 0x6b; intFreq = 3570000; }
    else {
      regA = 0x00; regB = 0x80; intFreq = 2300000;
      var real = 0;
      var left = bw;
      if (left > LP[0] + 350000) { left -= 380000; intFreq += 380000; real += 380000; }
      else regB |= 0x20;
      if (left > LP[0]) { left -= 350000; intFreq += 350000; real += 350000; }
      else regB |= 0x40;
      var idx = LP.length - 1;
      for (var i = 0; i < LP.length; i++) { if (left > LP[i]) { idx = i - 1; break; } }
      if (idx < 0) idx = 0;
      regB |= 15 - idx;
      real += LP[idx];
      intFreq -= Math.floor(real / 2);
    }
    await r82Mask(0x0a, regA, 0x10);
    await r82Mask(0x0b, regB, 0xef);
    return intFreq;
  }

  async function initTuner() {
    shadow.fill(0);
    await r82Write(0x05, INIT);
    await r82Mask(0x0c, 0x00, 0x0f);
    await r82Mask(0x13, 49, 0x3f);
    await r82Mask(0x1d, 0x00, 0x38);
    intFreq = IF_HZ;
    var cal = 0;
    for (var pass = 0; pass < 2; pass++) {
      await r82Mask(0x0b, 0x6b, 0x60);
      await r82Mask(0x0f, 0x04, 0x04);
      await r82Mask(0x10, 0x00, 0x03);
      var locked = await setPll(56000000);
      if (!locked) continue;
      await r82Mask(0x0b, 0x10, 0x10);
      await delay(2);
      await r82Mask(0x0b, 0x00, 0x10);
      await r82Mask(0x0f, 0x00, 0x04);
      var read = await r82Read(0x00, 5);
      cal = read[4] & 0x0f;
      if (cal && cal !== 0x0f) break;
    }
    if (cal === 0x0f) cal = 0;
    await r82Mask(0x0a, 0x10 | cal, 0x1f);
    await r82Mask(0x0b, 0x6b, 0xef);
    await r82Mask(0x07, 0x00, 0x80);
    await r82Mask(0x06, 0x10, 0x30);
    await r82Mask(0x1e, 0x60, 0x60);
    await r82Mask(0x05, 0x01, 0x80);
    await r82Mask(0x1f, 0x00, 0x80);
    await r82Mask(0x0f, 0x00, 0x80);
    await r82Mask(0x19, 0x60, 0x60);
    await r82Mask(0x1d, 0xe5, 0xc7);
    await r82Mask(0x1c, 0x24, 0xf8);
    await r82Write(0x0d, new Uint8Array([0x53]));
    await r82Write(0x0e, new Uint8Array([0x75]));
    await r82Mask(0x05, 0x00, 0x60);
    await r82Mask(0x06, 0x00, 0x08);
    await r82Mask(0x11, 0x38, 0x38);
    await r82Mask(0x17, 0x30, 0x30);
    await r82Mask(0x0a, 0x40, 0x60);
    await r82Mask(0x1d, 0x00, 0x38);
    await r82Mask(0x1c, 0x00, 0x04);
    await r82Mask(0x06, 0x00, 0x40);
    await r82Mask(0x1a, 0x30, 0x30);
    await delay(80);
    await r82Mask(0x1d, 0x18, 0x38);
    await r82Mask(0x1c, 0x24, 0x04);
    await r82Mask(0x1e, 14, 0x1f);
    await r82Mask(0x1a, 0x20, 0x30);
    await setGain(null);
  }

  async function setGain(tenthDb) {
    gainTenth = tenthDb;
    if (tenthDb == null) {
      await r82Mask(0x05, 0x00, 0x10);
      await r82Mask(0x07, 0x10, 0x10);
      await r82Mask(0x0c, 0x0b, 0x9f);
      await demodWrite(0, 0x19, 0x25, 1);
      return;
    }
    await demodWrite(0, 0x19, 0x05, 1);
    await r82Mask(0x05, 0x10, 0x10);
    await r82Mask(0x07, 0x00, 0x10);
    await r82Mask(0x0c, 0x08, 0x9f);
    var lna = [0, 9, 13, 40, 38, 13, 31, 22, 26, 31, 26, 14, 19, 5, 35, 13];
    var mix = [0, 5, 10, 10, 19, 9, 10, 25, 17, 10, 8, 16, 13, 6, 3, -8];
    var total = 0;
    var lnaIndex = 0;
    var mixIndex = 0;
    for (var i = 0; i < 15; i++) {
      if (total >= tenthDb) break;
      total += lna[++lnaIndex];
      if (total >= tenthDb) break;
      total += mix[++mixIndex];
    }
    await r82Mask(0x05, lnaIndex, 0x0f);
    await r82Mask(0x07, mixIndex, 0x0f);
  }

  async function setSampleRate(rate) {
    if (!rateAllowed(rate)) throw new Error("Sample rate is outside the RTL2832 resampler");
    var ratio = sampleRatio(XTAL, rate);
    await repeater(true);
    var bwIf = await setBandwidth(rate);
    await repeater(false);
    await setIf(bwIf);
    await demodWrite(1, 0x9f, (ratio >> 16) & 0xffff, 2);
    await demodWrite(1, 0xa1, ratio & 0xffff, 2);
    await demodWrite(1, 0x01, 0x14, 1);
    await demodWrite(1, 0x01, 0x10, 1);
  }

  async function setFrequency(hz) {
    if (hz < MIN_HZ || hz > MAX_HZ) throw new Error("Frequency must stay between 24 and 1766 MHz");
    freqHz = hz;
    await repeater(true);
    var lo = hz + intFreq;
    await setMux(lo);
    var locked = await setPll(lo);
    await repeater(false);
    if (!locked) throw new Error("Tuner PLL did not lock");
  }

  async function resetBuffer() {
    await writeReg(1, 0x2148, 0x1002, 2);
    await writeReg(1, 0x2148, 0x0000, 2);
  }

  function ensureAudio() {
    var Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx || audio) return;
    audio = new Ctx({ sampleRate: 48000 });
    proc = audio.createScriptProcessor(4096, 0, 1);
    proc.onaudioprocess = function (ev) {
      var out = ev.outputBuffer.getChannelData(0);
      out.fill(0);
      var i = 0;
      while (i < out.length && pcmRead !== pcmWrite) {
        out[i++] = pcm[pcmRead];
        pcmRead = (pcmRead + 1) % pcm.length;
      }
    };
    proc.connect(audio.destination);
    if (audio.state === "suspended") audio.resume();
  }

  function pushPcm(chunk) {
    for (var i = 0; i < chunk.length; i++) {
      var next = (pcmWrite + 1) % pcm.length;
      if (next === pcmRead) pcmRead = (pcmRead + 1) % pcm.length;
      pcm[pcmWrite] = chunk[i];
      pcmWrite = next;
    }
  }

  function draw() {
    if (!latest || typeof document === "undefined") return;
    var canvases = document.querySelectorAll(".exo-usb-wf");
    for (var c = 0; c < canvases.length; c++) {
      var canvas = canvases[c];
      var ctx = canvas.getContext("2d");
      var w = canvas.width;
      var h = canvas.height;
      var image = ctx.getImageData(0, 0, w, h);
      image.data.copyWithin(w * 4, 0, image.data.length - w * 4);
      var peak = -160;
      for (var x = 0; x < w; x++) {
        var bin = latest[Math.floor(x / w * latest.length)];
        if (bin > peak) peak = bin;
        var v = Math.max(0, Math.min(255, (bin + 120) * 2));
        var p = (h - 1) * w * 4 + x * 4;
        image.data[p] = v < 40 ? 4 : 0;
        image.data[p + 1] = Math.min(255, 40 + v);
        image.data[p + 2] = Math.min(255, 80 + v);
        image.data[p + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    }
  }

  function loop() {
    if (dirty) { dirty = false; draw(); }
    raf = root.requestAnimationFrame(loop);
  }

  function startWorker() {
    if (worker || !root.Worker || !scriptSrc) return;
    worker = new Worker(new URL("exo-iq-worker.js", scriptSrc));
    worker.onmessage = function (ev) {
      var msg = ev.data;
      if (!msg || msg.type !== "frame" || !running) return;
      latest = msg.spectrum;
      dirty = true;
      if (msg.pcm) pushPcm(msg.pcm);
      var mhz = (freqHz / 1e6).toFixed(3);
      var gain = gainTenth == null ? "Auto" : (gainTenth / 10).toFixed(1) + " dB";
      paint("Receiving · " + mhz + " MHz · " + mode + " · gain " + gain);
    };
    worker.postMessage({ type: "config", mode: mode, sampleRate: RATE });
  }

  async function readLoop() {
    while (running && device) {
      var res = await device.transferIn(1, 16384);
      if (!running) break;
      if (res.status !== "ok" || !res.data || !res.data.byteLength) continue;
      var copy = new Uint8Array(res.data.byteLength);
      copy.set(new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength));
      if (worker) worker.postMessage({ type: "iq", buffer: copy.buffer }, [copy.buffer]);
    }
  }

  async function closeDevice() {
    running = false;
    latest = null;
    if (worker) { worker.postMessage({ type: "config", mode: mode, sampleRate: RATE }); }
    if (device) {
      try { await device.close(); } catch (err) { /* already closed */ }
    }
    device = null;
    paint(IDLE);
    var buttons = typeof document !== "undefined" ? document.querySelectorAll(".exo-usb-connect") : [];
    for (var i = 0; i < buttons.length; i++) buttons[i].textContent = "Connect USB SDR";
  }

  async function openDevice() {
    if (!root.navigator || !navigator.usb) {
      paint("USB receivers don't work in this browser.");
      fallback(NO_USB);
      return;
    }
    ensureAudio();
    startWorker();
    paint("Pick your USB SDR in the browser's list (often shown as RTL2838).");
    var picked;
    try {
      picked = await navigator.usb.requestDevice({
        filters: PRODUCTS.map(function (productId) { return { vendorId: VENDOR, productId: productId }; })
      });
    } catch (err) {
      paint(err && err.name === "SecurityError" ? openHelp(err)
        : "No receiver chosen. Plug the dongle in, press Connect USB SDR and pick it from the list. Nothing listed? Try another USB port or cable.");
      return;
    }
    try {
      await picked.open();
      if (picked.configuration == null) await picked.selectConfiguration(1);
      await picked.claimInterface(0);
      device = picked;
      await initBaseband();
      await repeater(true);
      var r820 = await i2cReadReg(0x34, 0x00);
      var r828 = r820 === 0x69 ? 0 : await i2cReadReg(0x74, 0x00);
      if (r820 === 0x69) { i2cAddr = 0x34; chip = "R820T"; }
      else if (r828 === 0x69) { i2cAddr = 0x74; chip = "R828D"; }
      else throw new Error("Dongle has no R820T or R828D tuner");
      await demodWrite(1, 0xb1, 0x1a, 1);
      await demodWrite(0, 0x08, 0x4d, 1);
      await setIf(IF_HZ);
      await demodWrite(1, 0x15, 0x01, 1);
      await initTuner();
      await repeater(false);
      await setSampleRate(RATE);
      await setFrequency(freqHz);
      if (gainTenth == null) await setGain(null);
      else { await repeater(true); await setGain(gainTenth); await repeater(false); }
      await resetBuffer();
      running = true;
      var buttons = document.querySelectorAll(".exo-usb-connect");
      for (var i = 0; i < buttons.length; i++) buttons[i].textContent = "Disconnect USB SDR";
      readLoop().catch(function (err) {
        running = false;
        paint("The receiver stopped sending (unplugged?). Plug it back in and press Connect USB SDR.");
      });
    } catch (err) {
      await closeDevice();
      paint(openHelp(err));
    }
  }

  function readControls(from) {
    if (typeof document === "undefined") return;
    function pick(cls) {
      if (from && from.classList && from.classList.contains(cls)) return from;
      return document.querySelector("." + cls);
    }
    var mhz = pick("exo-usb-mhz");
    var modeEl = pick("exo-usb-mode");
    var gainEl = pick("exo-usb-gain");
    if (mhz) {
      var parsed = Number(String(mhz.value).replace(/mhz/i, ""));
      if (Number.isFinite(parsed)) freqHz = Math.round(parsed * 1e6);
    }
    if (modeEl) mode = modeEl.value || "FM";
    if (gainEl) gainTenth = gainEl.value === "auto" ? null : Number(gainEl.value);
  }

  async function applyLive(ev) {
    var target = ev && ev.target;
    if (target && target.classList && typeof document !== "undefined") {
      ["exo-usb-mhz", "exo-usb-mode", "exo-usb-gain"].forEach(function (cls) {
        if (!target.classList.contains(cls)) return;
        var peers = document.querySelectorAll("." + cls);
        for (var i = 0; i < peers.length; i++) if (peers[i] !== target) peers[i].value = target.value;
      });
    }
    readControls(target);
    if (worker) worker.postMessage({ type: "config", mode: mode, sampleRate: RATE });
    if (!running || !device) return;
    try {
      await setFrequency(freqHz);
      await repeater(true);
      await setGain(gainTenth);
      await repeater(false);
    } catch (err) {
      paint("Couldn't retune the receiver. Try again, or disconnect and reconnect it.");
    }
  }

  function bind() {
    if (typeof document === "undefined") return;
    var gains = document.querySelectorAll(".exo-usb-gain");
    for (var g = 0; g < gains.length; g++) {
      if (gains[g].dataset.ready === "1") continue;
      gains[g].dataset.ready = "1";
      for (var i = 0; i < GAINS.length; i++) {
        var opt = document.createElement("option");
        opt.value = String(GAINS[i]);
        opt.textContent = (GAINS[i] / 10).toFixed(1) + " dB";
        gains[g].appendChild(opt);
      }
      gains[g].addEventListener("change", applyLive);
    }
    var inputs = document.querySelectorAll(".exo-usb-mhz, .exo-usb-mode");
    for (var n = 0; n < inputs.length; n++) inputs[n].addEventListener("change", applyLive);
    var buttons = document.querySelectorAll(".exo-usb-connect");
    for (var b = 0; b < buttons.length; b++) {
      buttons[b].addEventListener("click", function () {
        if (running) closeDevice();
        else openDevice();
      });
    }
    if (!root.navigator || !navigator.usb) {
      paint("USB receivers don't work in this browser.");
      fallback(NO_USB);
      for (var d = 0; d < buttons.length; d++) buttons[d].disabled = true;
    } else {
      paint(IDLE);
      fallback("");
    }
    if (!raf && root.requestAnimationFrame) raf = root.requestAnimationFrame(loop);
  }

  var api = {
    IDLE: IDLE,
    VENDOR: VENDOR,
    PRODUCTS: PRODUCTS,
    GAINS: GAINS,
    sampleRatio: sampleRatio,
    rateAllowed: rateAllowed,
    MIN_HZ: MIN_HZ,
    MAX_HZ: MAX_HZ,
  };
  root.EXO = root.EXO || {};
  root.EXO.usbSdr = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
    else bind();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
