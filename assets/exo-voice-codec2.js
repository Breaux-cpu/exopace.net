/* Low-bitrate DPCM voice packets for short mesh bursts. This is not Codec2 mode 700C. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function encode(samples) {
    if (!samples || !samples.length) return { status: "NO AUDIO", frames: [] };
    if (samples.length < 80) return { status: "BASELINE_CALIBRATING", frames: [] };
    var prev = 0;
    var deltas = [];
    for (var i = 0; i < samples.length; i++) {
      var sample = samples[i];
      if (!finite(sample)) return { status: "NO AUDIO", frames: [] };
      var target = Math.max(-32768, Math.min(32767, Math.round(sample)));
      var step = target - prev;
      if (step > 127) step = 127;
      if (step < -127) step = -127;
      prev += step;
      deltas.push(step);
    }
    return { status: "PACKET", frames: [{ codec: "exo-dpcm", rate: 8000, deltas: deltas }] };
  }

  function decode(frame) {
    if (!frame || !frame.deltas || !frame.deltas.length) return [];
    var prev = 0;
    var out = [];
    for (var i = 0; i < frame.deltas.length; i++) {
      prev += frame.deltas[i];
      out.push(prev);
    }
    return out;
  }

  function workletSource() {
    return [
      "class ExoVoiceProcessor extends AudioWorkletProcessor {",
      "  process(inputs) {",
      "    var channel = inputs[0] && inputs[0][0];",
      "    if (channel && channel.length) this.port.postMessage(channel.length);",
      "    return true;",
      "  }",
      "}",
      "registerProcessor('exo-voice-dpcm', ExoVoiceProcessor);",
    ].join("\n");
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-voice");
      if (host) host.textContent = "NO AUDIO";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.voice = { encode: encode, decode: decode, workletSource: workletSource, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
