/**
 * Compatibility re-export. Canonical ESM lives in protocol/index.js.
 * Mesh loads mesh/protocol.js (IIFE). The shipped MOC bundle inlined protocol.
 */
export * from "./protocol/index.js";
