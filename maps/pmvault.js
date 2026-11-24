/* Local PMTiles archives in IndexedDB, with an OPFS copy when the browser allows it. */
(function (root) {
  var DB = "exopace-pmtiles";
  var STORE = "archives";
  var protocol = null;
  var TN = { west: -90.4, south: 34.9, east: -81.6, north: 36.8 };

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idb(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var done = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(done); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function overlapsTennessee(header) {
    if (!header) return false;
    return header.maxLon >= TN.west && header.minLon <= TN.east && header.maxLat >= TN.south && header.minLat <= TN.north;
  }

  async function writeOpfs(name, blob) {
    try {
      if (!root.navigator.storage || !root.navigator.storage.getDirectory) return false;
      var dir = await (await root.navigator.storage.getDirectory()).getDirectoryHandle("pmtiles", { create: true });
      var handle = await dir.getFileHandle(name, { create: true });
      var writer = await handle.createWritable();
      await writer.write(blob);
      await writer.close();
      return true;
    } catch (err) {
      return false;
    }
  }

  function put(name, record) {
    return idb("readwrite", function (store) { store.put(record, name); });
  }

  function get(name) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).get(name);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function all() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function register(maplibregl) {
    if (!root.pmtiles || !maplibregl || !maplibregl.addProtocol || protocol) return protocol;
    protocol = new root.pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return protocol;
  }

  async function attach(record) {
    if (!protocol || !record || !record.blob) return null;
    var file = new File([record.blob], record.name, { type: "application/octet-stream" });
    var archive = new root.pmtiles.PMTiles(new root.pmtiles.FileSource(file));
    protocol.add(archive);
    var header = await archive.getHeader();
    record.header = {
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      minLon: header.minLon,
      minLat: header.minLat,
      maxLon: header.maxLon,
      maxLat: header.maxLat,
      tileType: header.tileType,
    };
    return { archive: archive, header: header, file: file };
  }

  async function importFile(file) {
    var name = file.name || "region.pmtiles";
    var record = { name: name, bytes: file.size, blob: file, added: Date.now() };
    await writeOpfs(name, file);
    var attached = protocol ? await attach(record) : null;
    if (attached) record.header = {
      minZoom: attached.header.minZoom,
      maxZoom: attached.header.maxZoom,
      minLon: attached.header.minLon,
      minLat: attached.header.minLat,
      maxLon: attached.header.maxLon,
      maxLat: attached.header.maxLat,
      tileType: attached.header.tileType,
    };
    await put(name, record);
    return record;
  }

  function paint(record) {
    var node = document.getElementById("exo-vault-status");
    if (!node) return;
    if (!record) {
      node.textContent = "NO LOCAL PMTILES · DEM CACHE SEPARATE";
      return;
    }
    var header = record.header;
    var mb = (record.bytes / 1048576).toFixed(1);
    var box = header ? header.minLon.toFixed(2) + "," + header.minLat.toFixed(2) + " → " + header.maxLon.toFixed(2) + "," + header.maxLat.toFixed(2) : "HEADER UNREAD";
    var region = header && overlapsTennessee(header) ? " · COVERS TENNESSEE" : "";
    node.textContent = record.name + " · " + mb + " MB · " + box + region;
  }

  async function mount(map) {
    var rows = [];
    try { rows = await all(); } catch (err) { paint(null); return; }
    var dem = root.EXO && root.EXO.dem ? await root.EXO.dem.stats() : { tiles: 0 };
    if (!rows.length) {
      paint(null);
      var node = document.getElementById("exo-vault-status");
      if (node) node.textContent += " · DEM TILES " + dem.tiles;
      return;
    }
    var record = rows[rows.length - 1];
    var attached = null;
    try { attached = await attach(record); } catch (err) { attached = null; }
    paint(record);
    if (!attached || !map || !map.getStyle) return;
    var header = attached.header;
    var tiles = ["pmtiles://" + record.name + "/{z}/{x}/{y}"];
    if (header.tileType >= 2 && header.tileType <= 5 && !map.getSource("local-pm")) {
      map.addSource("local-pm", { type: "raster", tiles: tiles, tileSize: 256, minzoom: header.minZoom, maxzoom: header.maxZoom });
      map.addLayer({ id: "local-pm", type: "raster", source: "local-pm" });
    }
  }

  function bind() {
    var button = document.getElementById("exo-vault-import");
    var input = document.getElementById("exo-vault-file");
    if (!button || !input || button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      importFile(file).then(function (record) {
        paint(record);
        if (root.EXO && root.EXO.map && root.EXO.map.addLayer) return mount(root.EXO.map);
      }).catch(function () {
        var node = document.getElementById("exo-vault-status");
        if (node) node.textContent = "IMPORT FAILED · ARCHIVE UNREAD";
      });
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.pmvault = {
    register: register,
    importFile: importFile,
    mount: mount,
    bind: bind,
    hasArchive: function () { return all().then(function (rows) { return rows.length > 0; }).catch(function () { return false; }); },
    overlapsTennessee: overlapsTennessee,
    paint: paint,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(typeof globalThis !== "undefined" ? globalThis : window);
