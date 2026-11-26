/*
 * EXOpace RF scan — local-only detection storage.
 * Copyright © 2026 EXOpace contributors
 * Licensed under GNU GPL-3.0-or-later. See sentinel/rf/LICENSE.
 */

const DB_NAME = "exo-sentinel-rf";
const DB_VERSION = 1;
const SETTINGS_KEY = "settings";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("detections")) {
        const store = db.createObjectStore("detections", { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("category", "bestCategory");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const defaultSettings = {
  id: SETTINGS_KEY,
  presets: ["global"],
  threshold: 50,
  enabledCategories: null,
  customEntries: [],
};

export async function loadSettings() {
  const db = await openDb();
  const tx = db.transaction("settings", "readonly");
  const row = await new Promise((resolve, reject) => {
    const req = tx.objectStore("settings").get(SETTINGS_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return { ...defaultSettings, ...(row || {}) };
}

export async function saveSettings(settings) {
  const db = await openDb();
  const tx = db.transaction("settings", "readwrite");
  tx.objectStore("settings").put({ ...defaultSettings, ...settings, id: SETTINGS_KEY });
  await txDone(tx);
  db.close();
}

export async function upsertDetection(row) {
  const db = await openDb();
  const tx = db.transaction("detections", "readwrite");
  const store = tx.objectStore("detections");
  const existing = await new Promise((resolve, reject) => {
    const req = store.get(row.id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  const next = existing
    ? {
        ...existing,
        ...row,
        firstSeen: existing.firstSeen,
        lastSeen: row.lastSeen || row.updatedAt,
        count: (existing.count || 1) + 1,
        rssi: row.rssi != null ? row.rssi : existing.rssi,
        hits: row.hits && row.hits.length ? row.hits : existing.hits,
      }
    : { count: 1, firstSeen: row.updatedAt, lastSeen: row.updatedAt, ...row };
  store.put(next);
  await txDone(tx);
  db.close();
  return next;
}

export async function allDetections() {
  const db = await openDb();
  const tx = db.transaction("detections", "readonly");
  const rows = await new Promise((resolve, reject) => {
    const req = tx.objectStore("detections").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
}

export async function clearDetections() {
  const db = await openDb();
  const tx = db.transaction("detections", "readwrite");
  tx.objectStore("detections").clear();
  await txDone(tx);
  db.close();
}

export function detectionsToJson(rows) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    source: "EXOpace Sentinel RF Scan",
    attribution: "Signatures ported from RF Sentinel (CIS-C0), GPL-3.0-or-later. https://github.com/CIS-C0/RFSentinel",
    localOnly: true,
    count: rows.length,
    detections: rows,
  }, null, 2);
}

export function detectionsToCsv(rows) {
  const header = ["id", "name", "mac", "category", "label", "confidence", "tier", "rssi", "count", "firstSeen", "lastSeen", "evidence", "source", "transport"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const best = (row.hits && row.hits[0]) || {};
    const values = [
      row.id, row.name, row.mac, row.bestCategory || best.category, best.label,
      best.confidence, best.tier, row.rssi, row.count, row.firstSeen, row.lastSeen,
      best.evidence, best.source, row.transport,
    ].map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`);
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export async function exportDetections(format = "json") {
  const rows = await allDetections();
  const text = format === "csv" ? detectionsToCsv(rows) : detectionsToJson(rows);
  const type = format === "csv" ? "text/csv" : "application/json";
  const name = `exopace-rf-detections-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.${format === "csv" ? "csv" : "json"}`;
  return { rows, text, type, name };
}

export async function shareOrDownload(format = "json") {
  const file = await exportDetections(format);
  const blob = new Blob([file.text], { type: file.type });
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav && nav.share && nav.canShare) {
    const shareFile = new File([blob], file.name, { type: file.type });
    if (nav.canShare({ files: [shareFile] })) {
      await nav.share({ title: "EXOpace RF detections", files: [shareFile] });
      return { method: "share", ...file };
    }
    await nav.share({ title: "EXOpace RF detections", text: file.text.slice(0, 4000) });
    return { method: "share-text", ...file };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { method: "download", ...file };
}
