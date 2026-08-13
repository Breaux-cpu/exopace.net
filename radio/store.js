/* IndexedDB — chat, nodes, waypoints, rf samples, tracks. Offline-first. */
(function (g) {
  const NAME = "exopace-radio";
  const VER = 1;
  const STORES = ["chat", "nodes", "ways", "rf", "tracks"];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((s) => {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id", autoIncrement: true });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const os = t.objectStore(store);
      const req = fn(os);
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      if (req && req.onsuccess && mode === "readonly") req.onsuccess = () => resolve(req.result);
    }));
  }

  g.ExoStore = {
    put(store, rec) {
      if (!rec.ts) rec.ts = Date.now() / 1000;
      return tx(store, "readwrite", (os) => os.put(rec)).catch(() => {});
    },
    all(store) {
      return tx(store, "readonly", (os) => os.getAll()).catch(() => []);
    },
    clear(store) {
      return tx(store, "readwrite", (os) => os.clear()).catch(() => {});
    },
  };
})(window);
