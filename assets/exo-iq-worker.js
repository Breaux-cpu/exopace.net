/* Turns real unsigned IQ into a dBFS spectrum and 48 kHz audio. Idle input produces nothing. */
importScripts("exo-iq-dsp.js");

var mode = "FM";
var sampleRate = 2048000;
var fmState = {};
var usbState = {};
var FFT = 2048;

function windowed(i, q) {
  var n = Math.min(FFT, i.length);
  var re = new Float32Array(FFT);
  var im = new Float32Array(FFT);
  for (var k = 0; k < n; k++) {
    var w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1 || 1));
    re[k] = i[k] * w;
    im[k] = q[k] * w;
  }
  return { re: re, im: im };
}

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type === "config") {
    if (msg.mode) mode = msg.mode;
    if (msg.sampleRate) sampleRate = msg.sampleRate;
    fmState = {};
    usbState = {};
    return;
  }
  if (msg.type !== "iq" || !msg.buffer) return;
  var bytes = new Uint8Array(msg.buffer);
  if (bytes.length < 4) return;
  var iq = EXO_IQ.unsignedToIq(bytes);
  if (iq.i.length < 8) return;
  var specIn = windowed(iq.i, iq.q);
  EXO_IQ.fftRadix2(specIn.re, specIn.im);
  var spectrum = EXO_IQ.powerDbfs(specIn.re, specIn.im);
  var audio;
  if (mode === "AM") audio = EXO_IQ.demodAm(iq.i, iq.q);
  else if (mode === "USB") audio = EXO_IQ.demodUsb(iq.i, iq.q, sampleRate, usbState);
  else audio = EXO_IQ.scaleAudio(EXO_IQ.demodFm(iq.i, iq.q, fmState), sampleRate, 5000);
  var pcm = EXO_IQ.resample(audio, sampleRate, 48000);
  self.postMessage({ type: "frame", spectrum: spectrum, pcm: pcm }, [spectrum.buffer, pcm.buffer]);
};
