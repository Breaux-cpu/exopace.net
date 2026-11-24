/* Published Region-2 allocations. This is a reference, not a receiver. */
(function (root) {
  var ROWS = [
    { start: 144000000, end: 148000000, name: "2 m amateur", mode: "FM/SSB" },
    { start: 144390000, end: 144390000, name: "APRS", mode: "AFSK 1200" },
    { start: 145800000, end: 145800000, name: "ISS downlink", mode: "FM" },
    { start: 146520000, end: 146520000, name: "2 m calling", mode: "FM" },
    { start: 151820000, end: 154600000, name: "MURS", mode: "FM" },
    { start: 162400000, end: 162550000, name: "NOAA weather", mode: "FM" },
    { start: 156000000, end: 162025000, name: "Marine VHF", mode: "FM" },
    { start: 118000000, end: 137000000, name: "Airband", mode: "AM" },
    { start: 137620000, end: 137620000, name: "NOAA-15", mode: "APT" },
    { start: 462550000, end: 467725000, name: "GMRS", mode: "FM" },
    { start: 902000000, end: 928000000, name: "33 cm / ISM", mode: "LoRa/FM" },
  ];
  var LORA = [];
  for (var i = 0; i < 64; i++) LORA.push({ channel: i, hz: 902300000 + i * 200000 });

  function lookup(hz) {
    var n = Number(hz);
    if (!Number.isFinite(n)) return null;
    var exact = null;
    var band = null;
    ROWS.forEach(function (row) {
      if (n >= row.start && n <= row.end) {
        if (row.start === row.end) exact = row;
        else if (!band) band = row;
      }
    });
    var lora = null;
    LORA.forEach(function (row) {
      if (Math.abs(row.hz - n) <= 100000) lora = row;
    });
    return { hz: n, exact: exact, band: band, lora: lora };
  }

  root.EXO = root.EXO || {};
  root.EXO.rfdb = { lookup: lookup, lora: LORA, rows: ROWS };
})(typeof globalThis !== "undefined" ? globalThis : window);
