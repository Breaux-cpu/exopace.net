import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOTS = ["assets", "functions/api", "scripts", "deploy"];

function posix(root, file) {
  return relative(root, file).split("\\").join("/");
}

function included(rel) {
  if (rel === "env.js" || rel.endsWith("/env.js")) return false;
  if (rel.includes("index-B5yAHF7-") || rel.includes("sat-CIpmmEb5")) return false;
  if (rel.endsWith(".jks") || rel.endsWith(".env") || rel.includes("keystore")) return false;
  if (rel.startsWith("assets/exo-") && rel.endsWith(".js")) return true;
  if (rel.startsWith("functions/api/") && rel.endsWith(".js")) return true;
  if (rel.startsWith("scripts/") && (rel.endsWith(".mjs") || rel.endsWith(".js"))) return true;
  if (rel.startsWith("deploy/")) return true;
  return false;
}

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, out);
    else out.push(path);
  }
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildManifest(root) {
  const files = [];
  for (const folder of ROOTS) walk(join(root, folder), files);
  const rows = [];
  for (const file of files) {
    const rel = posix(root, file);
    if (!included(rel)) continue;
    const bytes = readFileSync(file);
    rows.push({ path: rel, sha256: sha256(bytes), bytes: bytes.length });
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { product: "exopace", files: rows };
}

export function verifyManifest(root, manifest) {
  const files = manifest && Array.isArray(manifest.files) ? manifest.files : [];
  for (const row of files) {
    if (!row || typeof row.path !== "string" || typeof row.sha256 !== "string") {
      return { status: "MISMATCH", path: row && row.path ? row.path : "" };
    }
    const path = join(root, ...row.path.split("/"));
    if (!existsSync(path)) return { status: "ABSENT", path: row.path };
    const hash = sha256(readFileSync(path));
    if (hash !== row.sha256) return { status: "MISMATCH", path: row.path };
  }
  return { status: "VERIFIED", path: null };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = buildManifest(root);
  const out = join(root, "sbom", "exopace.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
  const proof = verifyManifest(root, manifest);
  console.log(proof.status + " " + manifest.files.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
